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
        this.apd = 0;
        this.pdl = 0;
        this.state = "online";
    }

    jsonStatus() {
        return this.paths.map(p => {
                return {
                    host: this.host.name,
                    datastore: this.name,
                    datastore_isOnline: this.isOnline(),
                    srcPort: p.srcPort.name,
                    dst: p.dst,
                    dstPort: p.dstPort,
                    optimized: p.optimized,
                    ready: p.ready,
                    online: p.online,
                    restart_on_apd: this.host.enableAPDPDL,
                    restart_on_pdl: this.host.enableAPDPDL,
                    apd_timer: this.apd,
                    pdl_timer: this.pdl,
                };
            });
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
            log("VMHost [" + this.host.name + "] Datastore [" + this.name + "]: New Path:" + path.srcPort.fullName + " -> " + path.dst + ":" + path.dstPort);
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

    checkAPDPDL() {
        //check all paths, need to find at least 1 path this is online and ready
        let apd = true;
        let pdl = true;
        for (let path of this.paths) {
            if (path.online ) {
                apd = false;
            }

            if (path.online && path.ready) {
                pdl = false;
            }
        }
        if(apd) {this.apd += 1;} else {this.apd = 0;}
        if(pdl) {this.pdl += 1;} else {this.pdl = 0;}
    }

 }

class Target {
    constructor(target, targetPort) {
        this.target = target.toLowerCase();
        this.targetPort = targetPort.toLowerCase();
    }
    
    jsonStatus() {
        return this.target + ":" + this.targetPort;
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
        this.enableAPDPDL = false;
    }

    jsonStatus(){
        let status = {
            name: this.name,
            isOnline: this.isOnline(),
            //display all paths
            //datastores: this.datastores.map(d => d.jsonStatus()),
            targets: this.targets.map(t => t.jsonStatus()   ),
            //vms: this.vms.map(v => {v.jsonStatus()})
        };

        return status;
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
            return false;
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
                p.ready = "unknown";
                p.optimized = "unknown";

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
        if (this.enableAPDPDL) {
            for (let datastore of this.datastores) {
                datastore.checkAPDPDL();
                if (datastore.apd === 5) {
                    log("VM Host [" + this.name + "] APD detected on Datastore [" + datastore.name + "]");
                    //"restart all VMs on this datastore"
                    for (let vm of this.vms) {
                        if (vm.datastoreName === datastore.name) {
                            vm.handleAction("restart");
                        }
                    }

                } else if (datastore.pdl === 5) {
                    log("VM Host [" + this.name + "] PDL detected on Datastore [" + datastore.name + "]");
                    for (let vm of this.vms) {
                        if (vm.datastoreName === datastore.name) {
                            vm.handleAction("restart");
                        }
                    }
                }

            }
        }
    }

    
}


let vmStates = ["off", "powering_on", "running", "suspended"];

class VM {
    constructor(name, hosts, datastoreName, offgroup) {
        this.name = name.replace(/\s+/g, "_").toLowerCase();
        this.hosts = hosts; //send in order or preference
        this.datastoreName = datastoreName.toLowerCase();
        this.offgroup = offgroup;
        this.offgroup.addChild(this);
        
        this.currentHostObj = null;
        this.datastoreObj = null;
        this.state = "off";
        this.read_latency = "unknown";
        this.write_latency = "unknown";
        this.read_latency_max = "unknown";
        this.write_latency_max = "unknown";
        this.read_latencies = [];
        this.write_latencies = [];
    }

    jsonStatus() {
        let status = {
            name: this.name,
            state: this.state,
            currentHost: this.currentHostObj ? this.currentHostObj.name : "none",
            datastore: this.datastoreName,
            read_latency_average: this.read_latency,
            read_latency_max: this.read_latency_max,
            write_latency_average: this.write_latency,
            write_latency_max: this.write_latency_max
        };

        return status;
    }

    removeFromVMHost() {
        if (this.currentHostObj){
            //remove me from this.currentHost.vms
            this.currentHostObj.vms = this.currentHostObj.vms.filter(v => v.name !== this.name);

            this.currentHostObj = null;
        }
        //this.datastoreObj = null;
    }

    handleAction(event) {
        switch (event) {
            case "power_off":
                this.state = "off";
                this.removeFromVMHost();
                break;
            case "power_on":
                this.state = "booting";
                break;
            case "restart":
                this.state = "booting";
                break;
            case "step":
                this.step();
                break;
        }
    }

    round(num, places=1) {
        return Math.round(num * Math.pow(10, places)) / Math.pow(10, places);
    }

    readAck(packet) {
        this.read_latencies.push(packet.cumulativeLatency);

        //average all entries in the read_latencies array and store in read_latency
        let sum = 0;
        this.read_latency_max = 0;
        for (let latency of this.read_latencies) {
            sum += latency;
            if(this.read_latency_max < latency) {
                this.read_latency_max =this.round(latency);
            }
        }
        this.read_latency = sum / this.read_latencies.length;
        //round to 1 decimal place
        this.read_latency = this.round(this.read_latency);
        
    }

    writeAck(packet) {
        this.write_latencies.push(packet.cumulativeLatency);
        //average all entries in the write_latencies array and store in write_latency
        let sum = 0;
        this.write_latency_max = 0
        for (let latency of this.write_latencies) {
            sum += latency;
            
            if(this.write_latency_max < latency) {
                this.write_latency_max = this.round(latency);
            }
        }
        
        this.write_latency = sum / this.write_latencies.length;
        //round to 1 decimal place
        this.write_latency = this.round(this.write_latency);
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
                    //remove me from the old homst vms
                    this.removeFromVMHost()                    
                    this.currentHostObj = ready_host;
                    

                    //add this vm the host list if not already there
                    if (!this.currentHostObj.vms.find(v => v.name === this.name)) {
                        this.currentHostObj.vms.push(this);

                        this.datastoreObj = this.currentHostObj.datastores.find(d => d.name === this.datastoreName);
                    }
                    this.state = "running";
                    //log vm powered on event on which host
                    log("VM [" + this.name + "] powered on on host [" + this.currentHostObj.name + "]");
                }
                break;

            case "running":
            case "suspended":
                //check if datastore is online
                
                if (!this.datastoreObj || !this.datastoreObj.isOnline()) {
                    this.state = "suspended";
                } else {
                    this.state = "running";
                    this.datastoreObj.readIO(this.name);
                    this.datastoreObj.writeIO(this.name);
                    //print vm latency
                    //log("VM [" + this.name + "] Avg read latency: " + this.read_latency + "ms all readIO [" +this.read_latencies+"], Avg write latency: " + this.write_latency + "ms all writeIO [" +this.write_latencies+"]");
                    log("VM [" + this.name + "] Avg read latency: " + this.read_latency + "ms Avg write latency: " + this.write_latency + "ms ");
                }
                break;
            case "off":
                break;
        }
    }
}
