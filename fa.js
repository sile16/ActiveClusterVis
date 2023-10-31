//define a path object has, host, volume, array, controller, port,
class VolumeEntry {
  constructor(name, optimized, ready) {
    this.name = name;
    this.optimized = optimized;
    this.ready = ready;
  }
}

class IO {
  constructor(volume, vm) {
    this.volume = volume;
    this.vm = vm;
  }
}

class FlashArray  {
  constructor(name, hostConnectivity = "FC", acConnetivity = "ETH") {
    this.name = name.toLowerCase();
    this.ct0 = new FlashArrayController(`${name}-ct0`, this);
    this.ct1 = new FlashArrayController(`${name}-ct1`, this);
    this.ct0.setOtherController(this.ct1);
    this.ct1.setOtherController(this.ct0);
    this.controllers = [this.ct0, this.ct1];
    this.hostEntries = {};
    this.read_latency = 0.4;
    this.write_latency = 0.1;
    this.pods = [];
    this.hostConnectivity = hostConnectivity;
    this.acConnetivity = acConnetivity;
  }
    
  handleEvent(action) {
    if (action !== "promote") {
      this.controllers.forEach(controller => controller.handleEvent(action));
    }
  }

  handleControllerEvent(controllerName, action) {
      if (controllerName === 'CT0') {
          this.ct0.handleEvent(action);
      } else if (controllerName === 'CT1') {
          this.ct1.handleEvent(action);
      } else {
          console.error('Invalid controller name:', controllerName);
      }
  }

  getPrimaryController() {
    return this.controllers.find(c => c.state === "primary");
  }

  isOnline() {
    return this.ct0.isOnline() || this.ct1.isOnline();
  }
}

// Host Entry: has a host, a volume, and Preferred Array
// Only 1 Host, but multiple volumes and preferred arrays
// No need to be able to delete a HostEntry, for now, only check's host, not specific port
class HostEntry {
  constructor(fa, host) {
    this.fa = fa;
    this.host = host;
    this.volumes = [];
    this.preferredArrays = {};
    this.fa.hostEntries[host] = this;  
  }

  //add volumes
  addVolume(volume) {
    //add volume to list
    this.volumes.push(volume.toLowerCase())
  
  }

  removeVolume(volume) {
    //remove volume from list
    this.volumes = this.volumes.filter(v => v !== volume.toLowerCase());
  }

  getVolumes() {
    //return keys
    return this.volumes;
  }

  containsVolume(volume) {
    //see if volumes has key volume
    return this.volumes.includes(volume.toLowerCase());
  }

  //add preferred array
  addPreferredArray(array) {
    this.preferredArrays[array.id] = array;
  }

  removePreferredArray(array) {
    delete this.preferredArrays[array.id];
  }

  isPathOptimized(arrayName) {
    let optimized = true;
    // if the length of prefferedArrays is more than 0 and we are not in it, then we are not optimized
    if (Object.keys(this.preferredArrays).length > 0 && !this.preferredArrays.hasOwnProperty(arrayName)) {
      optimized = false;
    }
    return optimized;
  }
}

class FlashArrayController  {

  constructor(name, flashArray ) {
    this.name = name;
    this.state = 'secondary';
    this.fa = flashArray;
    
    this.ports = {};
    this.otherController = null;
    this.pods = {};

    this.ports["fc0"] = new Port("fc0", this, (packet, port) => this.receivePacketFromPortFC(packet, port));
    this.ports["fc1"] = new Port("fc1", this, (packet, port) => this.receivePacketFromPortFC(packet, port));

    this.ports["rep0"] = new Port("rep0", this, (packet, port) => this.receivePacketFromPortRep(packet, port));
    this.ports["rep1"] = new Port("rep1", this, (packet, port) => this.receivePacketFromPortRep(packet, port));

    this.ports["mgmt0"] = new Port("mgmt0", this, (packet, port) => this.receivePacketFromPortMgmt(packet, port));
    this.ports["mgmt1"] = new Port("mgmt1", this, (packet, port) => this.receivePacketFromPortMgmt(packet, port));
  }

  isOnline()  {
    return this.state !== "failed";
  }

  setOtherController(otherController) {
    this.otherController = otherController;
  }
  
  getOtherController() {
    return this.otherController;
  }

  getVolumePod(volume) {
    if (volume.includes("::")) {
      let podName = volume.split("::")[0];
      if (this.fa.pods.hasOwnProperty(podName)) {
        return this.fa.pods[podName];
      }
    }
    return null;
  }

  isVolumeAvailable(volume) {
    let pod = this.getVolumePod(volume);
    if (pod) {
      return pod.isOnline(this.fa.name);
    }
    return true;
  }

  checkHostVolumeAccess(host, volume){
    //find host entry:
    host = host.toLowerCase();
    let hostEntry = this.fa.hostEntries[host];
    if (hostEntry) {
      return hostEntry.containsVolume(volume);
    }
    return false;
  }

  listVolumes(hostname) {
    hostname = hostname.toLowerCase();
    //see if host exists in hostEntries
    let hostEntry = this.fa.hostEntries[hostname];
    if (hostEntry) {

      let optimized = hostEntry.isPathOptimized(this.fa.name);
      let volumes = [];
      
      //get the volume names from the list volumes list and create volume Entries
      for (let volume of hostEntry.getVolumes()) {
        let device_available = this.isVolumeAvailable(volume);
        volumes.push(new VolumeEntry(volume, optimized, device_available));
      }
      
      return volumes;
    }
  }
  
  
  
  receivePacketFromPortFC(packet, srcPort) {
    if (this.state === "secondary") {
      //forward to primary
      packet.addRoute(this, 0);
      this.otherController.receivePacketFromPortFC(packet, srcPort);
    }
    else if (this.state === "primary") {
      // return list of paths
      if (packet.message === "list_volumes") {
        // paths are the same for both controllers even if it's offline temporarily
        // find the host entry for the packet.source
        let volumes = this.listVolumes(packet.src);
        
        //create response packet
        packet.addRoute(this, 0);
        srcPort.sendResponsePacket(packet, "volumes", volumes);

      }
      else if (packet.message == "write") {
          let volume_name = packet.data.volume;

          //check host volume access
          if (!this.checkHostVolumeAccess(packet.src, volume_name)) {
            return;
          }

          //check if volume is available.
          if (!this.isVolumeAvailable(volume_name)) {
            return;
          }

          packet.addRoute(this, this.fa.write_latency);
          let pod = this.getVolumePod(volume_name);
          if(pod) {
            pod.ac_write(packet, srcPort, this);
          } else {
            srcPort.sendResponsePacket(packet,"write_ack", packet.data);
          }
              
        }
      else if (packet.message == "read") {
          let volume_name = packet.data.volume;

          //check host volume access
          if (!this.checkHostVolumeAccess(packet.src, volume_name)) {
            return;
          }
          //check if volume is available.
          if (!this.isVolumeAvailable(volume_name)) {
            return;
          }

          packet.addRoute(this, this.fa.read_latency);
          srcPort.sendResponsePacket(packet,"read_ack", packet.data);
          
        }
        
      }
    }
    

    handleEvent(event) {
      let otherController = this.getOtherController();

      switch (event) {
        case "fail":
          this.state = "failed";
          break;
        case "recover":
          if  ( this.state !== "primary" ) {
            this.state = "secondary";
          }
          break;
        case "promote":
          if (this.state === "secondary") {
            this.state = "primary";
            if (otherController.state === "primary") {
              otherController.state = "secondary";
            }
          } 
          break;
        case "step":
          this.step();
          break;
        default:
          console.error("Invalid event:", event);
      }
    }

    // function for step forward in the state machine
    step() {
      // Soft promote, always check to see if we need to be promoted.
      let otherController = this.getOtherController();
      if (this.state === "secondary" && otherController.state !== "primary" ) {
        this.state = "primary";
        console.log("FA [" + this.name + "] Self Promoted to primary ");
      }

      //Step each AC Pod
      if (this.state === "primary") {
        for (let pod of Object.values(this.fa.pods)) {
           pod.acStep(this);
        }
      }
    }
  
    receivePacketFromPortRep(packet, srcPort) {
      //I don't think AC fowards packets to other controller:
      if (this.state === "primary") {
        let acmessage = packet.data;
        switch (packet.message) {
          case "ac_write":
            srcPort.sendNewResponsePacket(packet, "ac_write_ack", acmessage);
            break;
          case "ac_write_ack":
            // have to do a little extra work to make sure we pass the cumlative latency, and minBWGibObserved

            
            acmessage.srcPort.sendResponsePacket(acmessage.original_packet, "write_ack", 
                                                     acmessage.original_packet.data,
                                                     packet.cumulativeLatency, 
                                                     packet.minBWGibObserved);
            break;
          case "ac_hearbeat":
            srcPort.sendResponsePacket(packet, "ac_heartbeat_ack", acmessage);
            break;
          case "ac_heartbeat_ack":
            acmessage.pod.arrays_states[this.fa.name].fa_connected = true;
            break;
        }
      }
    }
  
      receivePacketFromPortMgmt(packet, srcPort) {
        //I don't think AC fowards packets to other controller:
        if (this.state === "primary") {
          switch (packet.message) {
            case "ac_mediator_heartbeat_ack":
              acmessage.pod.arrays_states[this.fa.name].mediator_connected = true;
              break;
            case "ac_mediator_decision":
              break;
          }
        }
    }

    acSendData(pod, message, data) {
      //send data to other controller
      otherArray = pod.getOtherArray(this.fa.name);
      if (otherArray) {
        let dst_ports = [otherArray.ct0.ports["rep0"], otherArray.ct0.ports["rep1"], otherArray.ct1.ports["rep0"], otherArray.ct1.ports["rep1"]];
        let src_ports = [this.ports["rep0"], this.ports["rep1"]];
        //send message from both source ports to all destination ports
        for (let src_port of src_ports) {
          for (let dst_port of dst_ports) {
            src_port.sendNewPacket(dst_port, message, data);
          }
        }
      }
    }

    acSendMed(pod, message, data) {
      //send data to mediator
      let dst_ports = pod.mediator.ports;
      let src_ports = [this.ports["mgmt0"], this.ports["mgmt1"]];
      //send message from both source ports to all destination ports
      for (let src_port of src_ports) {
        for (let dst_port of dst_ports) {
          src_port.sendNewPacket(dst_port, message, data);
        }
      }
    }
  }
  
