//fa.js
//define a path object has, host, volume, array, controller, port,
class VolumeEntry {
  constructor(name, optimized, ready) {
    this.name = name.replace(/\s+/g, "_").toLowerCase();
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

class FlashArray extends NetworkGroup {
  constructor(name, hostConnectivity = "FC", acConnectivity = "ETH") {
    super(name);
    this.ct0 = new FlashArrayController(`${name}-ct0`, this);
    this.ct1 = new FlashArrayController(`${name}-ct1`, this);
    this.ct0.label = "CT0";
    this.ct1.label = "CT1";
    this.ct0.setOtherController(this.ct1);
    this.ct1.setOtherController(this.ct0);
    this.controllers = [this.ct0, this.ct1];
    this.hostEntries = {};
    this.read_latency = 0.5;
    this.write_latency = 0.2;
    this.pods = {};
    this.hostConnectivity = hostConnectivity;
    this.acConnectivity = acConnectivity;
    this.addChild(this.ct0);
    this.addChild(this.ct1);
  }

  jsonStatus() {
    return {
      name: this.name,
      state: this.isOnline() ? "online" : "offline",
      //isOnline: this.isOnline(),
      //hostEntries: Object.values(this.hostEntries).map(h => h.jsonStatus()),
      CT0: this.ct0.jsonStatus(),
      CT1: this.ct1.jsonStatus(),
    };
  }
    
  handleAction(action) {
    if (action !== "promote" ) {
      this.controllers.forEach(controller => controller.handleAction(action));
    }
  }

  handleControllerAction(controllerName, action) {
      if (controllerName === 'CT0') {
          this.ct0.handleAction(action);
      } else if (controllerName === 'CT1') {
          this.ct1.handleAction(action);
      } else {
          console.error('Invalid controller name:', controllerName);
      }
  }

  getPrimaryController() {
    return this.controllers.find(c => c.state === "primary");
  }

  isOnline() {
    return ( this.ct0.state === "primary" || this.ct1.state === "primary");
  }
}

// Host Entry: has a host, a volume, and Preferred Array
// Only 1 Host, but multiple volumes and preferred arrays
// No need to be able to delete a HostEntry, for now, only check's host, not specific port
class HostEntry {
  constructor(fa, host) {
    this.fa = fa;
    this.parent = fa;
    this.host = host;
    this.volumes = [];
    this.preferredArrays = {};
    this.fa.hostEntries[host] = this;  
  }

  jsonStatus() {
    return {
      fa: this.fa.name,
      host: this.host,
      volumes: this.volumes,
      preferredArrays: Object.keys(this.preferredArrays),
    };
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
  addPreferredArray(arrayName) {
    this.preferredArrays[arrayName] = true;
  }

  removePreferredArray(arrayName) {
    delete this.preferredArrays[arrayName];
  }

  isPathOptimized(arrayName) {
    let optimized = true;
    let arrayInPreferred = this.preferredArrays.hasOwnProperty(arrayName);
    // if the length of prefferedArrays is more than 0 and we are not in it, then we are not optimized
    if (Object.keys(this.preferredArrays).length == 0) {
      optimized = true; 
    } else if (!arrayInPreferred) {
      optimized = false;
    }
    return optimized;
  }
}

class FlashArrayController extends NetworkDevice {

  constructor(name, flashArray ) {
    super(name);
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

  jsonStatus() {
    return {
      //name: this.name,
      state: this.state,
    };
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

  getPodByVolume(volume) {
    //make sure "::" is in name:
    if (!volume.includes("::")) {
        return false;
    }

    let podName = volume.split("::")[0];
    //check that podName is on this array:
    if (!(podName in this.fa.pods)) {
        //log("Pod not on this array");
        return false;
    }

    let podObj = this.fa.pods[podName];
    //check if volume is in pod:
    if (!podObj.containsVolume(volume)) {
        //log("Volume not in pod");
        return false;
    }

    return podObj
  }

  isVolumeAvailable(volume) {
    if (volume.includes("::")) {
    
      let pod = this.getPodByVolume(volume);
      if (pod) {
        return pod.isVolumeAvailable(volume, this.fa.name);
      }
      return false;
     } else {
    // if at least either controller is primary, then the volume is available
     return this.fa.ct0.state === "primary" || this.fa.ct1.state === "primary";
    }
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
      return this.otherController.receivePacketFromPortFC(packet, srcPort);
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
        return false;

      }
      else if (packet.message === "write") {
          let volume_name = packet.data.volume;

          //check host volume access
          if (!this.checkHostVolumeAccess(packet.src, volume_name)) {
            return false;
          }

          //check if volume is available.
          if (!this.isVolumeAvailable(volume_name)) {
            return false;
          }

          packet.addRoute(this, this.fa.write_latency);
          let pod = this.getVolumePod(volume_name);
          if(pod) {
            pod.ac_write(packet, srcPort, this);
          } else {
            srcPort.sendResponsePacket(packet,"write_ack", packet.data);
          }
              
        }
      else if (packet.message === "read") {
          let volume_name = packet.data.volume;

          //check host volume access
          if (!this.checkHostVolumeAccess(packet.src, volume_name)) {
            return false;
          }
          //check if volume is available.
          if (!this.isVolumeAvailable(volume_name)) {
            return false;
          }

          packet.addRoute(this, this.fa.read_latency);
          srcPort.sendResponsePacket(packet,"read_ack", packet.data);
          
        }
        
      }
      return false;  //packet not processed
    }
    

    handleAction(event) {
      let otherController = this.getOtherController();

      switch (event) {
        case "fail":
          this.state = "failed";
          if (otherController.state === "secondary") {
            otherController.state = "primary";
          }
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
        case "pre_step":
            this.preStep();
            break;
        case "post_step":
            this.postStep();
            break;
        default:
          console.error("Invalid event:", event);
      }
    }

    postStep() {
      if (this.state === "primary") {
        //this.fa.pods is a list
        for (let pod of Object.values(this.fa.pods)) {
           let states = pod.array_states[this.fa.name];
           if (states.rep_latency) {
            //log
              if (states.rep_latency >= 12) {
                log("Array [" + this.fa.name + "] pod [" + pod.name + "] WAN latency too high, state:" + states.state);
              }
           }
        }
      }
    }

    // function for step forward in the state machine
    step() {
      // Soft promote, always check to see if we need to be promoted.


      let otherController = this.getOtherController();
      if (this.state === "secondary" && otherController.state !== "primary" ) {
        this.state = "primary";
        log("FA [" + this.name + "] Self Promoted to primary, Initial Power On ");
        for (let pod of Object.values(this.fa.pods)) {
          pod.arrayPowerOn(this.fa.name);
        }
      }

      //Step each AC Pod
      if (this.state === "primary") {
        //this.fa.pods is a list
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
            packet.addRoute(this, this.fa.write_latency);
            srcPort.sendResponsePacket(packet, "ac_write_ack", acmessage);
            break;
          case "ac_write_ack":
            // have to do a little extra work to make sure we pass the cumlative latency, and minBWGibObserved


            
            acmessage.srcPort.sendResponsePacket(acmessage.original_packet, "write_ack", 
                                                     acmessage.original_packet.data,
                                                     packet.cumulativeLatency, 
                                                     packet.minBWGibObserved);
            break;
          case "ac_heartbeat":
            srcPort.sendResponsePacket(packet, "ac_heartbeat_ack", acmessage);
            return false; //prevents dataFlowing from showing
            break;
          case "ac_heartbeat_ack":
            //if packet cumm latency is > 11 we error:
            acmessage.pod.array_states[this.fa.name].rep_latency = packet.cumulativeLatency;
            if ( packet.cumulativeLatency >= 12 ) {
              //log WAN latency too high
              //acmessage.pod.array_states[this.fa.name].rep_latency = 
              return false;

            } else {
              acmessage.pod.array_states[this.fa.name].fa_connected = true;
              return true;
            }
            return false;//prevents dataFlowing
            
            break;
          default:
            return false; // marked as not received.
          
        }
        return true; // Marked as received.
      }
      return false; // not received.
    }
  
      receivePacketFromPortMgmt(packet, srcPort) {
        //I don't think AC fowards packets to other controller:
        let medRequest = null;
        let states = null;
        if (this.state === "primary") {
          let podObj = null;

          switch (packet.message) {
            case "ac_mediator_heartbeat_ack":
              let acmessage = packet.data;
              acmessage.pod.array_states[this.fa.name].mediator_connected = true;
              break;

            case "ac_mediation_won_ack":
              medRequest = packet.data;
              states = medRequest.podObj.array_states[this.fa.name];
              podObj = medRequest.podObj;
              if (medRequest.requestId === states.last_known_mediation_request_id
                && states.state === "paused") {
                //states.mediator_won = true;
                states.elected = true;
                //states.mediator_response = true;

                podObj.mediation_request_id += 1;
                podObj.setStateSynced(this.fa.name);
                log("Array [" + this.fa.name + "] pod [" + podObj.name + "] Won Mediator, state:" + states.state);
              }
              break;
            
            case "ac_mediation_lost_ack":
              medRequest = packet.data;
              states = medRequest.podObj.array_states[this.fa.name];
              podObj = medRequest.podObj;
              if (medRequest.requestId === states.last_known_mediation_request_id
                && states.state === "paused") {
                //states.mediator_response = true;
                //states.mediator_won = false;
                states.elected = false;
                states.state = "offline";
                log("Array [" + this.fa.name + "] pod [" + podObj.name + "] Lost Mediator, state:" + states.state);
              }

              break;
            default:
              return false;
            
          }
          return true;
        }
        return false;
    }

    acSendData(pod, message, data) {
      //send data to other controller
      if(this.state === "primary" && this.isOnline()) {
        let otherArray = pod.getOtherArray(this.fa.name);
        if (otherArray ) {
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
    }

    acSendMed(pod, message, data) {
      if(this.state === "primary" && this.isOnline()) {
        //send data to mediator
        let dst_ports = pod.mediator.ports;
        let src_ports = [this.ports["mgmt0"], this.ports["mgmt1"]];
        //send message from both source ports to all destination ports
        for (let src_port of src_ports) {
          for (let dst_port of dst_ports) {
            //if data is type MediationRequest clone it
            if (data instanceof MediationRequest) {
              data = data.clone();
            }
            src_port.sendNewPacket(dst_port, message, data);
          }
        }
      }
    }
  }
  
