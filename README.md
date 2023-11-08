# ActiveClusterVis
This project simulates an environment using Pure FlashArray Active Cluster.  The goal is to simulate failure senarios for different configurations to make it easier to understand how it works and why certain settings like VMWare APD/PDL settings are needed.

## Try it out Now
[MultiSite](https://sile16.github.io/ActiveClusterVis/testmultisite.html)

## Usage

### Actions
Pull the dropdown for actions and then click on devices or links.  Some actions are only relevant to some devices, non relevant actions will be ignored.


### Steps - Moving time forward.
Think of a step as a couple of seconds.  The goal is not to simulate actual timing, however, but to simulate the order of events how they would actually occur. By default, it moves a step foward after each action done by clicking. Some failure senarios, like showing how a simultanious failure of the FA<->FA links and the medaitor, will require un-checking the Auto step, failing all the devices, then stepping forward.  This is so that pre-election doesn't occur automatically.   Also note, that you may need to manually step forward to get to a steady state.  There are many timers, suchs as, pod re-sync, mediatior delay, mediator failover override delay, VMWare APD and PDL delays, how long a VM can be suspended before it fails, etc.   Also, again, in this simulation it's measured in steps and should reflect relative timeouts in the real world in order to ensure correct order of events, however, the absolute values are not simulated.

### Network / Device Simulation
Because the nework can have so many different topologies, the only way to handle it is to simulate it.  We have virtual switches, WAN links with latency, packets that get sent by controllers, IO sent by VMs. Target login and path discover sent by VM Hosts.   These are all made into packets sent across the network and if received by the other endpoint responded to. 

### Network Links
Links that are black lines means they are connected and available but no data is flowing. 

#### Pulsing lines, 
this means that one of the following was sent across the link: (Only read/write/mirrored_write IOs and read/write/mirrored_write acks, and Mediation Heartbets, and mediation requests.) The link that is pulsing means at least one successful packet traversed that link and was received by the other end.

#### Read & Write Latency 
It is reported by the VM, the FlashArrays have a fixed internal write latency or 0.2ms write and 0.5ms read.  Local links have latency of 0 and the WAN links are configurable. There are some interesting senarios where a write could traverse the WAN twice in Unified configurations, for example, so we wanted to show failure conditions impact to latency and also highlight the fact that all reads are serviced locally.  There is a read and write IO sent down every possible path, which potentially will average some local IO with WAN IO in certain active/Optimized setups.

### Replciation FC vs Eth
Both behaviors should be able to simulated accurately.  For Eth, there is a crossover cable between the replication switches. 

### Host FC/iSCSI
Behavior should be identical regarless of host connectivity type.

### Non-Uniform
The multi-site comes up with non-uniform.

### Uniform
You can add Uniform Optimized links.   This creates the links, adds other array targets to the VMHost, and creates a host entry on the array to allow access to the pod volume.

### Uniform non-optimized
You can set the host entries preferred array wich will set the wan links to non-optimized, the VMHost will then see this new status and only use those links if there isn't an optimized path available.

### VMs
The VM when in the booting state will wait until it finds a VMHost will it's datastore (same name as volume name), that is online on a host in it's allowed host list.

### All Paths Down (APD) / Permanent Device Loss (PDL)
APD, is hopefully transient, it means there was not a response from the storage array, the message just timed out.  In that VMHost state this is the "online" property of the path.  PDL means the array responded, but told the VMHost the device is lost, in this simulation this is the "ready" property of the volume. In this situation it will happen if the Pod is offline on an active array the simulation will return not read for those Volumes.

The VMHost setting for what to do with APD/PDL by default matches vmware, do nothing.  However, if you want the VM to automatically be restarted on another available VM Host, you need to set this.

More information (Here)[https://support.purestorage.com/Solutions/VMware_Platform_Guide/User_Guides_for_VMware_Solutions/ActiveCluster_with_VMware_User_Guide/vSphere_Metro_Storage_Cluster_With_ActiveCluster%3A_Configuring_vSphere_HA]


### Simulated Behaviors
 - Links failures
 - switch failures
 - mediator failure
 - FA Controller failure / promotion / failure
 - FA Host settings (controlls paths, and optimized, non-optimized paths, volume availability)
 - Pod (Array add, volume availability baselining, re-sycing, mediation requests, pre-election, recovery, Wan latency exceeds 11ms behavior)
 - VMWare Host failure, path discovery.
 - Datastores (APD & PDL settings and VMWare restart)
 - VMs (simulates IO, running, suspended, provisioning)

### Future Simulation
More complicated or specific examples can easily be created now that all the underlying components are simulated.  Bad setup examples for instance, if site2 requires site1 mgmt switches to talk to the mediator.  You could set that up and show how it fails.
