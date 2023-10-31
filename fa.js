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
  constructor(name) {
    this.name = name.toLowerCase();
    this.ct0 = new FlashArrayController(`${name}-ct0`, this);
    this.ct1 = new FlashArrayController(`${name}-ct1`, this);
    this.ct0.setOtherController(this.ct1);
    this.ct1.setOtherController(this.ct0);
    this.controllers = [this.ct0, this.ct1];
    this.hostEntries = [];
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
class HostEntry {
  constructor(host) {
    this.host = host;
    this.volumes = [];
    this.preferredArrays = [];
  }

  //add volumes
  addVolume(volume) {
    this.volumes.push(volume);
  }

  removeVolume(volume) {
    this.volumes.splice(this.volumes.indexOf(volume), 1);
  }

  //add preferred array
  addPreferredArray(array) {
    this.preferredArrays.push(array);
  }

  removePreferredArray(array) {
    this.preferredArrays.splice(this.preferredArrays.indexOf(array), 1);
  }

  
}

class FlashArrayController  {

  constructor(name, flashArray, hostConnectivity = "FC", acConnetivity = "ETH" ) {
    this.name = name;
    this.state = 'secondary';
    this.fa = flashArray;
    this.hostEntries = [];
    this.hostConnectivity = hostConnectivity;
    this.acConnetivity = acConnetivity;
    this.write_latency = 0.1;
    this.read_latency = 0.5;
    this.ports = {};

    this.ports["fc0"] = new Port("fc0", this, (packet, port) => this.receivePacketFromPortFC(packet, port));
    this.ports["fc1"] = new Port("fc1", this, (packet, port) => this.receivePacketFromPortFC(packet, port));
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

  listVolumes(hostname) {
    let paths = [];
    let hostEntry = this.fa.hostEntries.find(h => h.host === hostname);
    if (hostEntry) {
      let optimized = true;
      // if the length of prefferedArrays is more than 0 and we are not in it, then we are not optimized
      if (hostEntry.preferredArrays.length > 0 && !hostEntry.preferredArrays.includes(this.fa.name)) {
        optimized = false;
      }
      

      let volumes = [];
  
      for (let v in hostEntry.volumes) {
        let device_available = true;
        //future todo: get device ready status from the POD
        volumes.push(new VolumeEntry(v, optimized, device_available));
      }
      return volumes;
    }
  }
  
  
  receivePacketFromPortFC(packet, srcPort) {
    if (this.state === "secondary") {
      //forward to primary
      packet.addRoute(this, 0);
      this.flashArray.getPrimaryController().receivePacket(packet, srcPort);
    }
    else if (this.state === "primary") {
      // return list of paths
      if (packet.message === "list_volumes") {
        // paths are the same for both controllers even if it's offline temporarily
        // find the host entry for the packet.source
        let volumes = this.listVolumes(packet.src);
        
        //create response packet
        let responsePacket = new Packet(this.name, srcPort.name, packet.src, packet.srcPort, "volumes", volumes);
        //send response packet
        responsePacket.addRoute(this, 0);
        srcPort.sendPacket(responsePacket);

      }
      else if (packet.message == "write") {
          let volume_name = packet.data.volume;

          // if primary, check for a host entry for packet.source
          let volumes = this.list_volumes(packet.src);
          if (volume_name in volumes) {
              packet.addRoute(this, this.write_latency);
              srcPort.sendResponsePacket(packet,"write_ack", packet.data);
          }
        }
      else if (packet.message == "read") {
          let volume_name = packet.data.volume;

          // if primary, check for a host entry for packet.source
          let volumes = this.list_volumes(packet);
          if (volume_name in volumes) {
              packet.addRoute(this, this.write_latency);
              srcPort.sendResponsePacket(packet,"read_ack", packet.data);
          }
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
        console.log("Self Promoted: ", this.name);
      } 
    }
  }
  
