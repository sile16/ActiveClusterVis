# ActiveClusterVis

This project simulates an environment utilizing Pure FlashArray Active Cluster. The objective is to replicate failure scenarios for various configurations to facilitate a better understanding of the system's workings, particularly the necessity of settings like VMware APD/PDL.

## Try it Out Now

Experience the simulation in action:

[MultiSite Simulation](https://sile16.github.io/ActiveClusterVis/testmultisite.html)

[Video Demo](https://youtu.be/JdCZLPLJpKA)

## Usage

### Actions

Use the dropdown menu to select actions, then click on devices or links to apply them. Some actions are only applicable to certain devices and will be disregarded if they are not relevant.

### Steps - Advancing Time

A 'step' represents a progression of a few seconds. The aim is to emulate the sequence of events rather than the actual timing. By default, the simulation advances one step after each user action. Certain failure scenarios, such as demonstrating the concurrent failure of FA<->FA links and the mediator, require disabling the 'Auto step' feature. This allows all devices to fail before progressing, preventing automatic pre-election. Note that manual advancement may be necessary to reach a steady state due to various timers, such as pod re-sync, mediator delay, mediator failover override delay, and VMware APD and PDL delays, among others. The simulation counts these in 'steps' to reflect relative timeouts in real-world scenarios, ensuring the correct sequence of events, though not the absolute time values.

### Network / Device Simulation

Given the complexity of network topologies, the simulation encompasses a wide range of components, including virtual switches, WAN links with latency, and packets sent by controllers and VMs for operations like target login and path discovery. These packets traverse the simulated network, with responses generated upon successful receipt.


## Buttons

### Add Eth WAN & ETH AC
This creates the WAN connections and adds the secondary array to the Pod, stretching it across to the other array.  This won't work if you've already added FC AC.

### Add FC WAN Connectsion
This creates the links between the SAN fabrics from site to site.  This doesn't accomplish anything but is needed for using ActiveCluster, or for doing Unified connectivity but using Eth for Active Cluster.

### Add FC AC
This sets up the array to array connection and stretched the pod to the other array.

### Add Uniform Host Entries
This adds the host entries for site1 VMHost to access site2 FlashArray volumes. 

### Set Preferred Array in Host Entry
This marks the paths over the WAN as non-optimized, it will only use these paths if all optimized paths fail.

### Enable VMWware APD/PDL
Enables it on both VM Hosts.

## Network Links

- **Grey Links**: Represented by grey lines, indicating connectivity without active data transfer.
- **Solid Lines**: Signify the transit of specific packets, such as read/write IOs, mirrored write acks, and mediation heartbeats. Colored balls indicate the type of traffic, and you can hover over the link to see more details.

#### Read & Write Latency

Reported by the VM, the FlashArrays are configured with fixed latencies of 0.2ms for writes and 0.5ms for reads. Local links have zero latency, while WAN links are variable. This setup allows the simulation to exhibit the impact of failures on latency and demonstrate that all reads are serviced locally.

### Replication: FC vs. Ethernet

The simulation aims to accurately represent both FC and Ethernet replication behaviors, including the use of crossover cables for Ethernet-based replication.

### Host Connectivity: FC/iSCSI

Regardless of whether the host uses FC or iSCSI, the behavior remains consistent.

### Non-Uniform Configuration

The multi-site simulation initializes in a non-uniform configuration by default.  When it starts up it does 4 steps up front, so you will see controllers becoming primary, then path discovery, then the VM comes online, then Pod get's stretched to the other array, does it's baseline and the VM starts some IO.

### Uniform Configuration

Users can add Uniform Optimized links, which simulate the establishment of additional array targets to the VMHost and the creation of a host entry on the array for pod volume access.

### Uniform Non-Optimized

Setting the host entry's preferred array to non-optimized will influence the VMHost to prioritize other paths when optimized ones are unavailable.

### VM Behavior

VMs in a booting state will wait for an available VMHost with a matching datastore before proceeding.

### All Paths Down (APD) / Permanent Device Loss (PDL)

- **APD**: A temporary state indicating a lack of response from the storage array, represented in the simulation as the "online" property of the path.
- **PDL**: Occurs when the array responds with a notification of device loss. In this simulation, it's represented by the "ready" property of a volume and is triggered when a Pod goes offline.

The default VMHost behavior for APD/PDL events is inaction. However, users can configure automatic VM restarts on alternate VMHosts.

For more information, visit the (Pure ActiveCluster with VMWare Guide))[https://support.purestorage.com/Solutions/VMware_Platform_Guide/User_Guides_for_VMware_Solutions/ActiveCluster_with_VMware_User_Guide/vSphere_Metro_Storage_Cluster_With_ActiveCluster%3A_Configuring_vSphere_HA]


### Simulated Behaviors

- Link and switch failures
- Mediator, FA Controller, and VMWare Host failures, including controller promotion
- FA Host settings management
- Pod behaviors such as volume availability, re-syncing, and mediation
- VMWare path discovery
- Datastore behaviors, including APD & PDL settings
- VM operations, such as IO simulation and state transitions

### Future Simulation Enhancements

The framework now supports the creation of more complex or specific scenarios, such as improperly configured setups. For

### Future Simulation
More complicated or specific examples can easily be created now that all the underlying components are simulated.  Bad setup examples for instance, if site2 requires site1 mgmt switches to talk to the mediator.  You could set that up and show how it fails.

### Notes
To run locally you will need to allow java script to load files locally, you can launch crhome on Mac like this:
```
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --allow-file-access-from-files
```

To export node positions run the following code in developer mode:
```
let positions = {};
cy.nodes().forEach(node => {
    if (!node.id().includes('ball')) {
      positions[node.id()] = node.position();
    }
});
console.log(positions);
```

### Todo
 - build unit tests
 - record some videos using the tool
 - multi Pod/VM Senarios.
 - Bad practices examples.

### Test Cases
 - Pre-election saves you in successive failures
 - Failover preference working for Pre-election
 - Failover preference working for mediator
 - Failover preferenece override when preferred array fails.
 - Non-Uniform Host failover, shows vm restart and APD/PDL behavior
 - Uniform failover and latency impact
 - Non-Uniform, what happends when either by random selection or by failover preference the wrong array is selected.
 - Primary controller both replication links fail, (does not induce controller failure, and can take pod offline.)
 - Zombie controllers, split brain everything, then power off, power back on one, win the mediator, then power off, power on other, then either connect to mediator or to other array, everything should come back automatically and the correct array should re-sync with the proper winner.

 