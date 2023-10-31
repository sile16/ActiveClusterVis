//Create a site with a VMWare host, a VM and a datastore, 2 FC switches, 1 flasharray

class Site extends NetworkDevice {
    constructor(name) {
        super();
        this.name = name;

        let fa = new FlashArray(name+"fa1");
        this.fa = fa;
        let volumeName = name + "-datastore1";

        this.VMHost = new VMHost(name+"VMHost", [new Target(fa.ct0.name, "fc0"), 
                                            new Target(fa.ct0.name, "fc1"),
                                            new Target(fa.ct1.name, "fc0"),
                                            new Target(fa.ct1.name, "fc1")]);
        
        this.VM = new VM(name+"vm1", [this.VMHost], volumeName);
        

        let hostEntry = new HostEntry(fa, this.VMHost.name);
        hostEntry.addVolume(volumeName);
        this.hostEntry = hostEntry;
        
        this.FCswitch1 = new Switch(name+"FCswitch1A");
        this.FCswitch2 = new Switch(name+"FCswitch1B");

        this.FCswitch1.createConnection(this.VMHost.ports[0]);
        this.FCswitch2.createConnection(this.VMHost.ports[1]);
        this.FCswitch1.createConnection(this.fa.ct0.ports['fc0']);
        this.FCswitch2.createConnection(this.fa.ct0.ports['fc1']);
        this.FCswitch1.createConnection(this.fa.ct1.ports['fc0']);
        this.FCswitch2.createConnection(this.fa.ct1.ports['fc1']);

        //add mgmt switches
        this.mgmtswitch1 = new Switch(name+"mgmtswitch1");
        this.mgmtswitch2 = new Switch(name+"mgmtswitch2");

        this.mgmtswitch1.createConnection(this.fa.ct0.ports['mgmt0']);
        this.mgmtswitch2.createConnection(this.fa.ct0.ports['mgmt1']);
        this.mgmtswitch1.createConnection(this.fa.ct1.ports['mgmt0']);
        this.mgmtswitch2.createConnection(this.fa.ct1.ports['mgmt1']);

        //add replication switches:
        this.replicationSwitch1 = new Switch(name+"replicationSwitch1");
        this.replicationSwitch2 = new Switch(name+"replicationSwitch2");

        //add connections to rep0 & rep1
        this.replicationSwitch1.createConnection(this.fa.ct0.ports['rep0']);
        this.replicationSwitch2.createConnection(this.fa.ct0.ports['rep1']);
        this.replicationSwitch1.createConnection(this.fa.ct1.ports['rep0']);
        this.replicationSwitch2.createConnection(this.fa.ct1.ports['rep1']);

        //replication switches also have a local crossover connection
        this.replicationSwitch1.createSwitchConnection(this.replicationSwitch2);

        this.VM.handleEvent("power_on");
        //connect VMHost to FC switches
    }

    step() {
        //reset all connection dataflowing to false
        this.fa.handleEvent("step");
        this.VMHost.handleEvent("step");
        this.VM.handleEvent("step");
    }
}

class MultiSite extends NetworkDevice{
    constructor(name) {
        super();
        this.name = name;
        this.site1 = new Site("site1");
        this.site2 = new Site("site2");

        this.mediator = new Mediator();
        //create a cloud switch
        this.cloudSwitch = new Switch("cloudSwitch");
        this.cloudSwitch.createConnection(this.mediator.ports[0]);
        this.cloudSwitch.createSwitchConnection(this.site1.mgmtswitch1);
        this.cloudSwitch.createSwitchConnection(this.site1.mgmtswitch2);
        this.cloudSwitch.createSwitchConnection(this.site2.mgmtswitch1);
        this.cloudSwitch.createSwitchConnection(this.site2.mgmtswitch2);

        //create cross connect between replication switches
        this.site1.replicationSwitch1.createSwitchConnection(this.site2.replicationSwitch1, 5, 10);
        this.site1.replicationSwitch2.createSwitchConnection(this.site2.replicationSwitch2, 8, 10);

        //create pod
        let pod = new ActiveClusterPod("pod1", this.mediator, this.mediator.ports[0]);
        pod.addVolume("pod1::podDS1");
        pod.addArray(this.site1.fa);
        pod.addArray(this.site2.fa);
        this.pod = pod;

        //create vm on the pod DS
        this.site1.hostEntry.addVolume("pod1::podDS1");
        this.VM = new VM("podvm1", [this.site1.VMHost, this.site2.VMHost], "pod1::podDS1");
        this.VM.handleEvent("power_on");
        
    }

    step() {
        for (let c of globalAllConnections) {
            c.dataFlowing = false;
        }

        this.site1.step();
        this.site2.step();
        this.VM.step();
    }
}