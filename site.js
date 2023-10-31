//Create a site with a VMWare host, a VM and a datastore, 2 FC switches, 1 flasharray

class Site extends NetworkDevice {
    constructor(name) {
        super();
        this.name = name;

        let fa = new FlashArray("fa1");
        this.fa = fa;

        this.VMHost = new VMHost("VMHost", [new Target(fa.ct0.name, "fc0"), 
                                            new Target(fa.ct0.name, "fc1"),
                                            new Target(fa.ct1.name, "fc0"),
                                            new Target(fa.ct1.name, "fc1")]);
        
        this.VM = new VM("vm1", [this.VMHost], "datastore1");
        

        let hostEntry = new HostEntry(this.VMHost.name);
        hostEntry.addVolume("datastore1");
        this.fa.hostEntries.push(hostEntry);

        this.FCswitch1 = new Switch("FCswitch1A");
        this.FCswitch2 = new Switch("FCswitch1B");

        this.FCswitch1.createConnection(this.VMHost.ports[0]);
        this.FCswitch2.createConnection(this.VMHost.ports[1]);
        this.FCswitch1.createConnection(this.fa.ct0.ports['fc0']);
        this.FCswitch2.createConnection(this.fa.ct0.ports['fc1']);
        this.FCswitch1.createConnection(this.fa.ct1.ports['fc0']);
        this.FCswitch2.createConnection(this.fa.ct1.ports['fc1']);

        this.VMHost.handleEvent("power_on");
        //connect VMHost to FC switches
    }

    step() {
        this.fa.handleEvent("step");
        this.VMHost.handleEvent("step");
        this.VM.handleEvent("step");
    }
}