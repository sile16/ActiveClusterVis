class Path {
    constructor(srcPort, dst, dstPort, optimized, ready, online) {
        this.srcPort = srcPort;  // port object
        this.dst = dst; //text
        this.dstPort = dstPort; //text
        this.optimized = optimized; //boolean
        this.ready = ready; //boolean
        this.online = online; // boolean did we get a response from the array?
    }
} 

let datastoreStates = ["online", "suspended"];

class Datastore {
    // data will have paths
    constructor(name, host) {
        this.name = name.replace(/\s+/g, "_").toLowerCase();
        this.host = host;

        this.paths = [];
        this.read_latency = "unknown";
        this.write_latency = "unknown";
        this.apd = false;
        this.pdl = false;
        this.state = "online";
    }

    updatePath(volume, srcPort, packet) {
        //check to see if path exists and update it
        //must match srcPort, packet.src, packet.srcPort 
        let path = this.paths.find(p => p.srcPort === srcPort && p.dst === packet.src && p.dstPort === packet.srcPort);

        if (path) {
            path.optimized = volume.optimized;
            path.ready = volume.ready;
            path.online = true; //we got a response from the array
        } else {
            //create path object
            let path = new Path(srcPort, packet.src, packet.srcPort, volume.optimized, volume.ready, true);
            //add path to paths
            this.paths.push(path);
            //log new path details
            console.log("VM Host [" + this.host.name + "] New path added, Datastore [" + this.name + "]: " + path.srcPort.fullName + " -> " + path.dst + ":" + path.dstPort);
        }
    }

    isOnline() {
        //if at least one path is ready return true
        for (let path of this.paths) {
            if (path.ready && path.online) {
                return true;
            }
        }
        return false;
    }

    //readAck and writeAck are the same
    readAck(packet) {
        // find the vm and pass the IO
        let vm = packet.data.vm;
        let vmObj = this.host.vms.find(v => v.name === vm);
        if (vmObj) {
            vmObj.readAck(packet);
        }
    }

    writeAck(packet) {
        // find the vm and pass the IO
        let vm = packet.data.vm;
        let vmObj = this.host.vms.find(v => v.name === vm);
        if (vmObj) {
            vmObj.writeAck(packet);
        }
    }

    
    sendIO(type, vm ) {
        //Send IO down all optimized paths,
        //if there are no optimized paths, send IO down all paths
        
        //if there is an optimized path, only send IO down optimized paths 
        let anyPath = true;
        this.paths.forEach(path => {
            if (path.optimized && path.ready && path.online) {
                anyPath = false;
            }
        });

        //send IO,
        this.paths.forEach(path => {
            if (anyPath || path.optimized) {
                //create packet
                let packet = new Packet(path.srcPort.device.name, path.srcPort.name, path.dst, path.dstPort, type, new IO(this.name, vm));

                //send packet
                path.srcPort.sendPacket(packet);
            }
        }); 
    }

    readIO(vm){
        this.sendIO("read", vm );
    }

    writeIO(vm){
        this.sendIO("write", vm );
    }
    
 }

class Target {
    constructor(target, targetPort) {
        this.target = target.toLowerCase();
        this.targetPort = targetPort.toLowerCase();
    }
}

class VMHost extends NetworkDevice {
    constructor(name, targets) {
        super(name);
        
        //2 Ports FC0 & FC1
        this.ports = [new Port("fc0", this), new Port("fc1", this)];
        this.targets = targets;
        
        this.vms = [];
        this.datastores = [];
    }

    receivePacketFromPort(packet, srcPort) {
        // online and name checks already done in port
        // if message = path_response, add path to paths
        if (packet.message === "volumes") {
            // add paths to paths
            for (let v of packet.data) {
                // find datastore for volumes name
                let datastore = this.datastores.find(d => d.name === v.name);
                if (!datastore) {
                    //create datastore
                    datastore = new Datastore(v.name, this);
                    this.datastores.push(datastore);
                }
                
                if (datastore) {
                    datastore.updatePath(v, srcPort, packet);
                }

            }
        }
        else if (packet.message === "read_ack") {
            //update datastore read latency
            let io = packet.data
            let datastore = this.datastores.find(d => d.name === io.volume);
            if (datastore) {
                //set datastore latency
                datastore.readAck(packet);
            }
            
            
        }
        else if (packet.message === "write_ack") {
            //update datastore read latency
            let io = packet.data
            let datastore = this.datastores.find(d => d.name === io.volume);
            if (datastore) {
                datastore.writeAck(packet);
            }
        } else {
            return false;
        }
        return true;
    }

    getPaths() {
        //for each datastore mark paths as online = false
        for (let datastore of this.datastores) {
            datastore.paths.forEach(p => {
                p.online = false;
            });
        }

        //for each source port, send a packet to all target list_volumes
        for (let srcPort of this.ports) {
            // for each target, send a packet
            for (let target of this.targets) {
                //create packet
                let packet = new Packet(this.name, srcPort.name, target.target, target.targetPort, "list_volumes", {});

                //send packet
                srcPort.sendPacket(packet);
            }
        }
        
    }
    
    step() {
        //gets called from parent
        this.getPaths();
        //todo: check for APD and PDL, and after set delay restart VMs
        //
    }

    
}


let vmStates = ["off", "powering_on", "running", "suspended"];

class VM {
    constructor(name, hosts, datastoreName) {
        this.name = name.replace(/\s+/g, "_").toLowerCase();
        this.hosts = hosts; //send in order or preference
        this.datastoreName = datastoreName.toLowerCase();
        
        this.currentHost = null;
        this.datastoreObj = null;
        this.state = "off";
        this.read_latency = "unknown";
        this.write_latency = "unknown";
        this.read_latencies = [];
        this.write_latencies = [];
    }

    handleAction(event) {
        switch (event) {
            case "power_off":
                this.state = "off";
                this.currentHost = null;
                
                this.datastoreObj = null;
                break;
            case "power_on":
                this.state = "booting";
                break;
            case "restart":
                this.state = "booting";
                this.currentHost = null;
                
                this.datastoreObj = null;
                break;
            case "step":
                this.step();
                break;
        }
    }

    readAck(packet) {
        this.read_latencies.push(packet.cumulativeLatency);

        //average all entries in the read_latencies array and store in read_latency
        let sum = 0;
        for (let latency of this.read_latencies) {
            sum += latency;
        }
        this.read_latency = sum / this.read_latencies.length;
        //round to 1 decimal place
        this.read_latency = Math.round(this.read_latency * 10) / 10;
    }

    writeAck(packet) {
        this.write_latencies.push(packet.cumulativeLatency);
        //average all entries in the write_latencies array and store in write_latency
        let sum = 0;
        for (let latency of this.write_latencies) {
            sum += latency;
        }
        
        this.write_latency = sum / this.write_latencies.length;
        //round to 1 decimal place
        this.write_latency = Math.round(this.write_latency * 10) / 10;
    }

    step() {
        //clear latencies
        this.read_latency = "unknown";
        this.write_latency = "unknown";
        this.read_latencies = [];
        this.write_latencies = [];

        switch (this.state) {
            case "booting":
                //find a host, that has a matching datastore and is online
                let ready_host = this.hosts.find(h => h.datastores.find(d => d.name === this.datastoreName && d.isOnline()));
                if (ready_host) {
                    //send power on
                    this.currentHost = ready_host;
                    

                    //add this vm the host list if not already there
                    if (!this.currentHost.vms.find(v => v.name === this.name)) {
                        this.currentHost.vms.push(this);

                        this.datastoreObj = this.currentHost.datastores.find(d => d.name === this.datastoreName);
                    }
                    this.state = "running";
                    //log vm powered on event on which host
                    console.log("VM [" + this.name + "] powered on on host [" + this.currentHost.name + "]");
                }
                break;

            case "running":
            case "suspended":
                //check if datastore is online
                if (!this.datastoreObj.isOnline()) {
                    this.state = "suspended";
                } else {
                    this.state = "running";
                    this.datastoreObj.readIO(this.name);
                    this.datastoreObj.writeIO(this.name);
                    //print vm latency
                    console.log("VM [" + this.name + "] Avg read latency: " + this.read_latency + "ms all readIO [" +this.read_latencies+"], Avg write latency: " + this.write_latency + "ms all writeIO [" +this.write_latencies+"]");
                }
                break;
            case "off":
                break;
        }
    }
}
