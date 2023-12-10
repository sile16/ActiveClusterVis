//site.js
//Create a site with a VMWare host, a VM and a datastore, 2 FC switches, 1 flasharray
//Global variable globalAllConnections contains all connections in the network



class Site extends NetworkGroup {
    constructor(name, parent) {
        super(name);

        this.vms = {};
        this.vmhosts = {};
        this.switches = {};

        let fa = new FlashArray(name+"fa1");
        this.fa = fa;
        this.addChild(fa);

        let volumeName = name + "-datastore1";

        let vmhost = new VMHost(name+"VMHost", [new Target(fa.ct0.name, "fc0"), 
            new Target(fa.ct0.name, "fc1"),
            new Target(fa.ct1.name, "fc0"),
            new Target(fa.ct1.name, "fc1")]);
        this.vmhost = vmhost;

        this.vmhosts[vmhost.name] = vmhost 
        //create a list of the objects in this.vmhosts
        let vmhostList = [];
        for (let k in this.vmhosts) {
            vmhostList.push(this.vmhosts[k]);
        }
        let VMWareGroup = new NetworkGroup(name + " VMWare");

        this.addChild(VMWareGroup);
        VMWareGroup.addChildren(vmhostList);

        //let vm = new VM(name + "vm1", vmhostList, volumeName);
        //this.vms[vm.name] = vm;

        let hostEntry = new HostEntry(fa, vmhost.name);
        //hostEntry.addVolume(volumeName); 
        this.hostEntry = hostEntry;
        //this.hostEntries[hostEntry.name] = hostEntry;
        
        let FCswitch1 = new Switch(name+"fcswitchA");
        let FCswitch2 = new Switch(name+"fcswitchB");
        this.FCswitch1 = FCswitch1;
        this.FCswitch2 = FCswitch2;
        VMWareGroup.addChildren([FCswitch1, FCswitch2]);

        FCswitch1.createConnection(vmhost.ports[0]);
        FCswitch2.createConnection(vmhost.ports[1]);
        FCswitch1.createConnection(fa.ct0.ports['fc0']);
        FCswitch2.createConnection(fa.ct0.ports['fc1']);
        FCswitch1.createConnection(fa.ct1.ports['fc0']);
        FCswitch2.createConnection(fa.ct1.ports['fc1']);
        

        //add mgmt switches
        let mgmtswitch1 = new Switch(name+"mgmtswitch1");
        let mgmtswitch2 = new Switch(name+"mgmtswitch2");
        this.mgmtswitch1 = mgmtswitch1;
        this.mgmtswitch2 = mgmtswitch2;
        let mgmtGroup = new NetworkGroup(name + " MgmtSW");
        mgmtGroup.addChildren([mgmtswitch1, mgmtswitch2]);
        this.addChild(mgmtGroup);

        mgmtswitch1.createConnection(fa.ct0.ports['mgmt0']);
        mgmtswitch2.createConnection(fa.ct0.ports['mgmt1']);
        mgmtswitch1.createConnection(fa.ct1.ports['mgmt0']);
        mgmtswitch2.createConnection(fa.ct1.ports['mgmt1']);

        //eth replication switches
        let replicationSwitch1 = new Switch(name+"replicationswitch1");
        let replicationSwitch2 = new Switch(name+"replicationswitch2");
        this.replicationSwitch1 = replicationSwitch1;
        this.replicationSwitch2 = replicationSwitch2;
        let replicationGroup = new NetworkGroup(name + " ReplicationSW");
        replicationGroup.addChildren([replicationSwitch1, replicationSwitch2]);
        this.addChild(replicationGroup);
        
    }

    addReplicationSwitchConnections() {
        //add replication switches:
        let name = this.name;
        //add connections to rep0 & rep1
        this.replicationSwitch1.createConnection(this.fa.ct0.ports['rep0']);
        this.replicationSwitch2.createConnection(this.fa.ct0.ports['rep1']);
        this.replicationSwitch1.createConnection(this.fa.ct1.ports['rep0']);
        this.replicationSwitch2.createConnection(this.fa.ct1.ports['rep1']);
    }


    jsonStatus() {
        let status = {};
        status["fa"] = this.fa.jsonStatus();
        status["vmhost"] = this.vmhost.jsonStatus();
        return status;
    }

    addRepCrossover() {
        //replication switches also have a local crossover connection
        this.replicationSwitch1.createSwitchConnection(this.replicationSwitch2);
    }

    addFCReplication() {
        let name = this.name;

        this.FCswitch1.createConnection(this.fa.ct0.ports['rep0']);
        this.FCswitch1.createConnection(this.fa.ct1.ports['rep0']);
        this.FCswitch2.createConnection(this.fa.ct0.ports['rep1']);
        this.FCswitch2.createConnection(this.fa.ct1.ports['rep1']);
    }

 
    preStep() {
        for (let conn in globalAllConnections) {
            globalAllConnections[conn].clearFlowing();
        }
        super.preStep();
    }
    
}

class CloudSite extends NetworkGroup {
    constructor(name) {
        super(name);
        this.mediator = new Mediator();
        //create a cloud switch
        this.cloudSwitch = new Switch("cloudSwitch");

        //create a connection between the mediator and the cloud switch
        this.cloudSwitch.createConnection(this.mediator.ports[0]);

        this.addChild(this.mediator);
        this.addChild(this.cloudSwitch);
    }

}

class MultiSite extends NetworkGroup {
    constructor(name, wanLatency=3) {
        super(name);
        this.wans = [];
        this.wanLatency = wanLatency
       
        let site1 = new Site("site1");
        this.site1 = site1;

        let site2 = new Site("site2");
        this.site2 = site2;

        let site3 = new CloudSite("site3");
    
        this.pods = {};
        
        
        site3.cloudSwitch.createSwitchConnection(site1.mgmtswitch1);
        site3.cloudSwitch.createSwitchConnection(site1.mgmtswitch2);
        site3.cloudSwitch.createSwitchConnection(site2.mgmtswitch1);
        site3.cloudSwitch.createSwitchConnection(site2.mgmtswitch2);

        

        //create pod
        let pod = new ActiveClusterPod("pod1", site3.mediator, site3.mediator.ports[0]);
        pod.addVolume("pod1::podDS1");
        pod.addArray(site1.fa);
       
        this.pod = pod;

        //create pod group
        let podGroup = new NetworkGroup("ActiveCluster Pods");
        podGroup.addChildren([pod]);
        this.podGroup = podGroup;


        //create vm on the pod DS
        site1.hostEntry.addVolume("pod1::podDS1");
        site2.hostEntry.addVolume("pod1::podDS1");
        
    
        // Create Powered Off VM's Group
        let poweredOffVMsGroup = new NetworkGroup("powered_off_vms");
        this.VM = new VM("podvm1", [site1.vmhost, site2.vmhost], "pod1::podDS1", poweredOffVMsGroup);
        this.VM.handleAction("power_on");
        this.vms = [this.VM];
       
        this.addChild(poweredOffVMsGroup);
        this.poweredOffVMsGroup = poweredOffVMsGroup;

        //combine all the site1 & site2 allObjects into one list
        //combine the allObjects, which is a list of dictionaries, into one list
        //the two sites which same keys 
        //iterate through ditionary site.1.allObjects and add to this.allObjects   
        
        this.addChildren([site1, site2, site3]);
        this.addChildren([podGroup, poweredOffVMsGroup]);

        this.hostEntry2 = null;
        this.hostEntry3 = null; 
    }

    jsonStatus() {
        //['vms', 'pods', 'podstates', 'fas', 'fahosts', 'vmhosts', 'vmhost_paths']
        let status = {}
        //[this.site1.fa.jsonStatus(), this.site2.fa.jsonStatus()];
        status["vms"] = [this.VM.jsonStatus()];
        status["pods"] = [this.pod.jsonStatus()];
        //get the status of all the objects in pod.arrayStates
        status["podstates"] = Object.keys(this.pod.array_states).map(key => this.pod.array_states[key].jsonStatus())
        status['fas'] = [this.site1.fa.jsonStatus(), this.site2.fa.jsonStatus()];
        status['fahosts'] = Object.values(this.site1.fa.hostEntries).map(h => h.jsonStatus()).concat(Object.values(this.site2.fa.hostEntries).map(h => h.jsonStatus()));
        status['vmhosts'] = [this.site1.vmhost.jsonStatus(), this.site2.vmhost.jsonStatus()];

        let paths = [];
        for (let d in this.site1.vmhost.datastores) {
            paths = paths.concat(this.site1.vmhost.datastores[d].jsonStatus());
        }
        for (let d in this.site2.vmhost.datastores) {
            paths = paths.concat(this.site2.vmhost.datastores[d].jsonStatus());
        }
        //let hostpaths1 = this.site1.vmhost.datastores.map(d => d.jsonStatus());
        //let hostpaths2 = this.site1.vmhost.datastores.map(d => d.jsonStatus());

        status['vmhost_paths'] = paths;

        
        
        return status;
    }

    step() {
        //go through each object in diction this.allObjects and call handleAction("step")
        //clear flowing flag across all connections in the globla globalAllConnections
        //iterate through allObjects and call handleAction("step")
        for ( let c in globalAllConnections) {
            globalAllConnections[c].clearFlowing();
        }

        for (let o of this.children) {
            //check if this object has a handleAction method
            if (o.handleAction) {
                o.handleAction("step");
            } else {
                log("no handleAction method for object: "+o+"  objName: " + o.name);
            }
        }
       
    }

    addEthAC(){
        if (!this.replication_added) {
            this.replication_added = true;
            this.site1.addReplicationSwitchConnections();
            this.site2.addReplicationSwitchConnections();
            this.site1.addRepCrossover();
            this.site2.addRepCrossover();

            //create cross connect between replication switches
            this.wans.push(this.site1.replicationSwitch1.createSwitchConnection(this.site2.replicationSwitch1, this.wanLatency/2, 10));
            this.wans.push(this.site1.replicationSwitch2.createSwitchConnection(this.site2.replicationSwitch2, this.wanLatency/2, 10));
            this.pod.addArray(this.site2.fa);
            
        } else {
            log("replication already added, reload page to restart simulator.")
        }
    }

    addFCWan() {
        if (!this.fc_wan) {
            this.wans.push(this.site1.FCswitch1.createSwitchConnection(this.site2.FCswitch1, this.wanLatency/2));
            this.wans.push(this.site1.FCswitch2.createSwitchConnection(this.site2.FCswitch2, this.wanLatency/2));
            this.fc_wan = true;
        }
    }

    addFCReplication() {
        
        if (this.fc_wan) {
            if (!this.replication_added) {
                this.replication_added = true;
                this.site1.addFCReplication();
                this.site2.addFCReplication();
                this.pod.addArray(this.site2.fa);
            } else {
                log("replication already added, reload page to restart simulator.")
            }

        } else {
            log("Add FC WAN links first.")
        }


    }

    addFCUniformHostEntries() {
        if(this.hostEntry2 ){
            return;
        }

        if (!this.fc_wan) {
            log("Host Entries added but FC WAN links are needed to see additional paths.")
        }

        //we need host entries for these:
        this.hostEntry2 = new HostEntry(this.site1.fa, this.site2.vmhost.name);
        this.hostEntry2.addVolume("pod1::podDS1");

        this.hostEntry3 = new HostEntry(this.site2.fa, this.site1.vmhost.name);
        this.hostEntry3.addVolume("pod1::podDS1");

        //add Targets to VMWare Hosts so they discover the new paths
        this.site1.vmhost.targets.push(new Target(this.site2.fa.ct0.name, "fc0"));
        this.site1.vmhost.targets.push(new Target(this.site2.fa.ct0.name, "fc1"));
        this.site1.vmhost.targets.push(new Target(this.site2.fa.ct1.name, "fc0"));
        this.site1.vmhost.targets.push(new Target(this.site2.fa.ct1.name, "fc1"));

        this.site2.vmhost.targets.push(new Target(this.site1.fa.ct0.name, "fc0"));
        this.site2.vmhost.targets.push(new Target(this.site1.fa.ct0.name, "fc1"));
        this.site2.vmhost.targets.push(new Target(this.site1.fa.ct1.name, "fc0"));
        this.site2.vmhost.targets.push(new Target(this.site1.fa.ct1.name, "fc1"));
        log("Host entries created for cross site volume access.")

    }

    setPreferredArray() {
        if(!this.hostEntry2 ){
            return;
        }

       this.hostEntry2.addPreferredArray(this.site2.fa.name);
       this.hostEntry3.addPreferredArray(this.site1.fa.name);
    }

    setPodFailoverPreference(array) {
        this.pod.setFailoverPreference(array);
    }

    enableAPDPDL() {
        this.site1.vmhost.enableAPDPDL = true;
        this.site2.vmhost.enableAPDPDL = true;    
    }

    setWANLatency(latency) {
        //check if latency is numeric
        if (isNaN(latency)) {
            return;
        }


        this.wanLatency = Number(latency)/2;
        for (let wan of this.wans) {
            wan.latency = this.wanLatency;
        }
    }

    vMotion(vmname) {
        //find the vm by name
        let vm = this.vms.find(v => v.name == vmname);
        if (vm) {
            vm.handleAction("vMotion");
        }
    }
}