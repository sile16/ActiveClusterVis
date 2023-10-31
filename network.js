//make a global variable to track all connections:
let globalAllConnections = [];

class NetworkDevice {
    constructor() {
        this.state = "online";
    }

    isOnline() {
        return this.state === "online";
    }

    handleEvent(event) {
        switch (event) {
            case "fail":
                this.state = "failed";
                break;
            case "recover":
                this.state = "online";
                break;
            case "step":
                this.step();
                break;
        }
    }

    step() {
    }
}


class Packet {
    // all text fields except for data, which will be an object dpending on message type
    constructor(src, srcPort, dst, dstPort, message, data) {
        this.src = src.toLowerCase();
        this.srcPort = srcPort.toLowerCase();  
        this.dst = dst.toLowerCase();
        this.dstPort = dstPort.toLowerCase(); 
        this.message = message.toLowerCase();
        this.data = data;
        this.route = [];
        this.cumulativeLatency = 0;
        this.minBWGibObserved = 10000000;
    }

    addRoute(device, latency=0, bandwidthGib=999999) {
        this.route.push({ device, latency, bandwidthGib });
        this.cumulativeLatency += latency;
        if (bandwidthGib < this.minBWGibObserved) {
            this.minBWGibObserved = bandwidthGib;
        }
    }
    
}

class Port extends NetworkDevice {
    // text name, device is the device that owns the port
    constructor(name, device, packetHandler = null ) {
        super();
        this.name = name.toLowerCase();
        this.device = device;
        this.fullName = this.device.name + "-" + this.name;
        this.packetHandler = packetHandler;
        this.connection = null;
        this.forwarding = false;
    }

    setForwarding(forwarding) {
        this.forwarding = forwarding;
    }

    receivePacket(packet) {

        //console.log(this.device);  // Check what this.device is
        //console.log(this.device instanceof Switch);  // Check if this.device is an instance of Switch
        //console.log(Object.getPrototypeOf(this.device));  // Check the prototype of this.device
        //console.log(typeof this.device.isOnline);  // Check if isOnline is a function
        //console.log(this.device.isOnline());  // Check if isOnline is a function
        
        if (this.device.isOnline()) {
            if (this.forwarding  || (packet.dst === this.device.name.toLowerCase() && packet.dstPort === this.name)) {
                if ( this.packetHandler ) {
                    this.packetHandler(packet, this);
                } else {
                  this.device.receivePacketFromPort(packet, this);
                }
            }
        }
    }

    sendPacket(packet) {
        if (this.connection) {
            this.connection.receivePacketFromPort(packet, this);
        }
    }

    sendResponsePacket(packet, message, data,latency=0, bandwidthGib=999999 ) {
        //create a copy of the packet object
        let p = new Packet(this.device.name, this.name, packet.src, packet.srcPort, message, data);
        p.cumulativeLatency = packet.cumulativeLatency + latency;
        if (packet.minBWGibObserved > bandwidthGib) {
            p.minBWGibObserved = bandwidthGib;
        } else {
            p.minBWGibObserved = packet.minBWGibObserved;
        }
        this.sendPacket(p);
    }
    
    sendNewPacket(dst, dstPort, message, data) {
        let p = new Packet(this.device.name, this.name, dst, dstPort, message, data);
        this.sendPacket(p);
    }

    sendNewPacket(dstPortObj, message, data) {
        let p = new Packet(this.device.name, this.name, dstPortObj.device.name, dstPortObj.name, message, data);
    }
}



class Switch extends NetworkDevice {
    constructor(name) {
        super();
        this.name = name.toLowerCase();
        this.ports = [];
    }
        

    createPort() {
        //set port name to switch name + port number
        let name = this.name + "-" + this.ports.length;
        let port = new Port(name, this);
        port.forwarding = true;
        this.ports.push(port);
        return port;
    }

    createConnection(port1, latency=0, bandwidthGib=999999) {
        let port2 = this.createPort();
        return new Connection(port1, port2, latency, bandwidthGib);
    }

    createSwitchConnection(switchObj, latency=0, bandwidthGib=999999) {
        let port1 = this.createPort();
        return switchObj.createConnection(port1, latency, bandwidthGib);
    }

    receivePacketFromPort(packet, srcPort) {
        if (this.isOnline() ) {
            //check if this device is in the packet.route and drop if so to avoid loops
            if (packet.route.find(r => r.device === this.name)) {
                return;
            }

            packet.addRoute(this.name);
            for (let p of this.ports) {
                if (p !== srcPort) {
                    p.sendPacket(packet);
                }
            }
        }
    }
}


class Connection extends NetworkDevice {
    constructor(port1, port2, latency, bandwidthGib) {
        super();
        this.name = port1.fullName + "-" + port2.fullName;
        this.name = this.name.toLowerCase();
        this.ports = [port1, port2];
        port1.connection = this;
        port2.connection = this;
        this.latency = latency;
        this.bandwidthGib = bandwidthGib;
        this.dataFlowing = false;
        globalAllConnections.push(this);
    }

    receivePacketFromPort(packet, srcPort) {
        if (this.isOnline() ) {
            //check if this device is in the packet.route and drop if so to avoid loops
            if (packet.route.find(r => r.device === this.name)) {
                return;
            }

            packet.addRoute(this.name, this.latency, this.bandwidthGib);
            for (let p of this.ports) {
                if (p !== srcPort) {
                    switch (packet.message) {
                        case "read_ack":
                        case "write_ack":
                            this.dataFlowing = true;
                            break;
                    }
                    p.receivePacket(packet);
                }
            }
        }
    }
}

