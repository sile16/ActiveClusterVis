
# ActiveClusterVis

This project simulates an environment utilizing the Pure FlashArray Active Cluster. The objective is to replicate various failure scenarios across different configurations, providing a deeper understanding of the system's functionality, especially the importance of settings like VMware APD/PDL.

## Try it Out Now

Experience the simulation in action:

- [MultiSite Simulation](https://sile16.github.io/ActiveClusterVis/testmultisite.html)
- [Video Demo](https://youtu.be/JdCZLPLJpKA)

## Usage

### Actions

Use the dropdown menu to select actions and apply them to devices or links. Some actions are specific to certain devices and will be ignored if irrelevant.

### Steps - Advancing Time

A 'step' represents a short time progression, aiming to emulate the sequence of events rather than real-time duration. By default, the simulation advances one step after each user action. In certain failure scenarios, such as the simultaneous failure of FA<->FA links and the mediator, it's necessary to disable the 'Auto step' feature. This allows all devices to fail before advancing, thereby preventing automatic pre-election. Manual advancement may be required due to various timers, like pod re-sync, mediator delay, mediator failover override delay, and VMware APD and PDL delays. The simulation counts these in 'steps', mirroring relative timeouts in real-world scenarios and ensuring accurate event sequences.

### Network / Device Simulation

The simulation includes a range of complex network components such as virtual switches, WAN links with latency, and packets sent by controllers and VMs for operations like target login and path discovery. These packets move across the simulated network, eliciting responses upon successful reception.

## Buttons

### Add Eth WAN Cables & Eth Replication
This action creates WAN connections and adds a secondary array to the Pod, extending it to the other array. It's inapplicable if FC AC has already been added.

### Add FC WAN Cables
This establishes links between SAN fabrics from site to site, necessary for using ActiveCluster or for Unified connectivity using Eth for Active Cluster.

### Add FC Replication
This sets up the array-to-array connection and extends the Pod to the other array.

### Add Uniform Host Entries
This adds host entries for the site1 VMHost to access volumes on the site2 FlashArray.

### Set Preferred Array in Host Entry
This marks the WAN paths as non-optimized, using these paths only if all optimized ones fail.

### Enable VMware APD/PDL
Enables these settings on both VM Hosts.

## Network Links

- **Grey Links**: Represent connectivity without active data transfer.
- **Solid Lines**: Indicate active data packet transit, such as read/write IOs, mirrored write acks, and mediation heartbeats. Colored balls show traffic type, with details available on hover.

### Read & Write Latency

Latencies, as reported by the VM, are set at fixed rates of 0.2ms for writes and 0.5ms for reads on FlashArrays. Local links have no latency, while WAN links vary. This setup demonstrates the impact of failures on latency and ensures local servicing of all read requests.

### WAN Latency

Latency over 11ms triggers a warning. Sustained latency over 50ms results in disconnection from the peer array, akin to link loss. Reconnection occurs when latency falls below 11ms.

### Replication: FC vs. Ethernet

The simulation accurately depicts both FC and Ethernet replication behaviors, including crossover cables for Ethernet replication.

### Host Connectivity: FC/iSCSI

Behavior is consistent regardless of whether the host uses FC or iSCSI.

### Non-Uniform Configuration

The multi-site simulation initially starts in a non-uniform configuration. 

### Uniform Configuration

Allows for the addition of Uniform Optimized links, simulating the establishment of extra array targets for the VMHost and creating a host entry on the array for Pod volume access.

### Uniform Non-Optimized

Setting a non-optimized preferred array in the host entry influences VMHost to prioritize alternative paths when optimized paths are unavailable.

### VM Behavior

VMs in a booting state wait for an available VMHost with a matching datastore before proceeding.

### All Paths Down (APD) / Permanent Device Loss (PDL)

- **APD**: A temporary state indicating no response from the storage array, shown as the "online" status of the path in the simulation.
- **PDL**: Triggered by an array response notifying device loss, represented by the "ready" status of a volume in the simulation and activated when a Pod goes offline.

The default VMHost behavior for APD/PDL events is non-reactive. Users can configure automatic VM restarts on

 alternative VMHosts.

For additional information, visit the [Pure ActiveCluster with VMware Guide](https://support.purestorage.com/Solutions/VMware_Platform_Guide/User_Guides_for_VMware_Solutions/ActiveCluster_with_VMware_User_Guide/vSphere_Metro_Storage_Cluster_With_ActiveCluster%3A_Configuring_vSphere_HA).

### Simulated Behaviors

Includes link and switch failures, mediator and FA Controller and VMware Host failures (including controller promotion), FA Host settings management, Pod behaviors (volume availability, re-syncing, and mediation), VMware path discovery, datastore behaviors (APD & PDL settings), and VM operations (IO simulation and state transitions).

### Future Simulation Enhancements

The framework now supports creating more complex or specific scenarios, such as improperly configured setups, demonstrating the consequences of such configurations.

### Running Locally

To run locally, enable JavaScript to load files locally. Launch Chrome on a Mac with the following command:
```
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --allow-file-access-from-files
```

### Exporting Node Positions

To export node positions, run the following code in developer mode:
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

- Build unit tests.
- Develop multi-Pod/VM scenarios.
- Demonstrate bad practices examples.

### Test Cases

Includes various scenarios such as pre-election effectiveness in successive failures, failover preference functionality, host failover behaviors in uniform and non-uniform configurations, impact of latency on failover, primary controller replication link failures, and handling of split-brain situations.

