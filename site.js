//site.js
//Create a site with a VMWare host, a VM and a datastore, 2 FC switches, 1 flasharray
//Global variable globalAllConnections contains all connections in the network



class Site extends NetworkGroup {
    constructor(name, parent) {
        super(name);

        this.vms = {};
        this.vmhosts = {};
        this.switches = {};
        this.fas = {};
        this.hostEntires = {};

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

        let vm = new VM(name + "vm1", vmhostList, volumeName);
        this.vms[vm.name] = vm;

        let hostEntry = new HostEntry(fa, vmhost.name);
        hostEntry.addVolume(volumeName); 
        this.hostEntry = hostEntry;
        //this.hostEntries[hostEntry.name] = hostEntry;
        
        let FCswitch1 = new Switch(name+"fcswitchA");
        let FCswitch2 = new Switch(name+"fcswitchB");
        this.FCswitch1 = FCswitch1;
        this.FCswitch2 = FCswitch2;
        VMWareGroup.addChildren([FCswitch1, FCswitch2]);
        this.switches[FCswitch2.name] = FCswitch2; 

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


        //add replication switches:
        let replicationSwitch1 = new Switch(name+"replicationswitch1");
        let replicationSwitch2 = new Switch(name+"replicationswitch2");
        this.replicationSwitch1 = replicationSwitch1;
        this.replicationSwitch2 = replicationSwitch2;
        let replicationGroup = new NetworkGroup(name + " ReplicationSW");
        replicationGroup.addChildren([replicationSwitch1, replicationSwitch2]);
        this.addChild(replicationGroup);
        

        //add connections to rep0 & rep1
        replicationSwitch1.createConnection(fa.ct0.ports['rep0']);
        replicationSwitch2.createConnection(fa.ct0.ports['rep1']);
        replicationSwitch1.createConnection(fa.ct1.ports['rep0']);
        replicationSwitch2.createConnection(fa.ct1.ports['rep1']);


        //replication switches also have a local crossover connection
        replicationSwitch1.createSwitchConnection(replicationSwitch2);

        
        vm.handleAction("power_on");
        if(parent) {
            parent.addChild(vm);
        } else {
            this.addChild(vm);
        }


        
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
    constructor(name, rep_cross_connect, uniform) {
        super(name);

       
        let site1 = new Site("site1");
        //site1.layout['x'] = 0;
        //site1.layout['y'] = 0;

        let site2 = new Site("site2");
        //site1.layout['x'] = 50;
        //site1.layout['y'] = 0;
        //site2.layout['x'] = {x: 50, y: 0}

        let site3 = new CloudSite("site3");
        //site3.layout['x'] = {x: 25, y: 80}


    
        this.pods = {};
        
        
        site3.cloudSwitch.createSwitchConnection(site1.mgmtswitch1);
        site3.cloudSwitch.createSwitchConnection(site1.mgmtswitch2);
        site3.cloudSwitch.createSwitchConnection(site2.mgmtswitch1);
        site3.cloudSwitch.createSwitchConnection(site2.mgmtswitch2);

        //create cross connect between replication switches
        site1.replicationSwitch1.createSwitchConnection(site2.replicationSwitch1, 2, 10);
        site1.replicationSwitch2.createSwitchConnection(site2.replicationSwitch2, 2, 10);

        //create pod
        let pod = new ActiveClusterPod("pod1", site3.mediator, site3.mediator.ports[0]);
        pod.addVolume("pod1::podDS1");
        pod.addArray(site1.fa);
        pod.addArray(site2.fa);
        this.pod = pod;

        //create pod group
        let podGroup = new NetworkGroup("ActiveCluster Pods");
        podGroup.addChildren([pod]);
        this.podGroup = podGroup;
        

        //create vm on the pod DS
        site1.hostEntry.addVolume("pod1::podDS1");
        this.VM = new VM("podvm1", [site1.vmhost, site2.vmhost], "pod1::podDS1");
        this.VM.handleAction("power_on");
        
    
        // Create Powered Off VM's Group
        let poweredOffVMsGroup = new NetworkGroup("Powered Off VMs");
        poweredOffVMsGroup.addChildren([this.VM]);
        this.addChild(poweredOffVMsGroup);
        this.poweredOffVMsGroup = poweredOffVMsGroup;

        //combine all the site1 & site2 allObjects into one list
        //combine the allObjects, which is a list of dictionaries, into one list
        //the two sites which same keys 
        //iterate through ditionary site.1.allObjects and add to this.allObjects   
        
        this.addChildren([site1, site2, site3]);
        this.addChildren([podGroup, poweredOffVMsGroup]);
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
                console.log("no handleAction method for object: "+o+"  objName: " + o.name);
            }
        }
       
    }

  
}