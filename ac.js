

class ACMessage {
    constructor(podObj, volumeName=null, vmName=null) {
        this.pod = podObj;
        this.volume = volumeName;
        this.vm = vmName;
        this.srcPort = null;
        this.original_packet = null;
    }
}

class MediationRequest {
    //podName, array1 time since request, array2 time since request,
    constructor(arrayName, podObj, mediation_request_id, packet) {
        this.arrayName = arrayName
        this.podObj = podObj
        this.podName = podObj.name;
        this.failoverPreference = podObj.failoverPreference;
        
        this.requestId = mediation_request_id
        this.timeSinceRequest = 0;
        
        this.packet = packet;
    }
}

class MediationState {
    constructor(name, requestId) {
        this.name = name;
        this.mediation_requests = {};
        this.heardFrom = [];
        this.rejectQueue = [];
        this.requestId = requestId;
        this.decision = null;
        this.timeSinceRequest = 0;
        this.timeSinceRequest = 0;
    }
}

class Mediator extends NetworkDevice {
    constructor(name = "Cloud Mediator") {
        super(name);
        this.activeArray = null;
        this.ports = [new Port('eth0', this)];
        this.decision_delay = 2;  //normal delay for decision
        this.failoverPreferenceOverride = 5;  
        this.mediation_requests = [];  //dictionary by pod name,
        this.mediation_states = {};
    }
    
    receivePacketFromPort(packet, srcPort) {
        if (packet.message === "ac_mediator_heartbeat") {
            // create new packet to send back
            srcPort.sendResponsePacket(packet, "ac_mediator_heartbeat_ack", packet.data);

        } else if (packet.message === "ac_mediation_request") {
            //first check if there is an existing mediation
            let mediation_request = packet.data;
            mediation_request.packet = packet;
            this.mediation_requests.push(mediation_request);
        }
    }

    handleAction(action) {
        super.handleAction(action);
        if (action === "fail") {
            this.state = "failed";
        } else if (action === "recover") {
            this.state = "online";
        }
    }

    sendResponse(request, medState, msg) {
        
        this.ports[0].sendResponsePacket(request.packet, msg, request);
        this.mediation_requests.splice(this.mediation_requests.indexOf(request), 1);
    }

    sendWonResponse(request, medState) {
        this.sendResponse(request, medState, "ac_mediation_won_ack");

    }

    sendLostResponse(request, medState) {
        this.sendResponse(request, medState, "ac_mediation_lost_ack");
    }

    makeDecision(request, medState) {
        if (medState.decision) {
            return;
        }

        if (medState.timeSinceRequest < this.decision_delay) {
            return;
        }
           
        //check if all arrays have reported:
        if (medState.heardFrom.length === 2) {
            //if failover preference is set, then winner is faill over preference
            if (request.failoverPreference) {
                medState.decision = request.failoverPreference;
                return;
            } else {
                //if not set, then winner is picked at random
                medState.decision = medState.heardFrom[Math.floor(Math.random() * medState.heardFrom.length)];
                return;
            }
        }
        else {
            //if not all arrays have reported, and we are over delay pick the winner
            if (medState.failoverPreference) {
                if(medState.failoverPreference === medState.heardFrom[0]) {
                    //We have winner
                    medState.decision = medState.heardFrom[0];
                }
                else if (medState.timeSinceRequest > this.failoverPreferenceOverride) {
                    medState.decision = medState.heardFrom[0];
                }
            }
            else {
                //since there is not a fialover preference we don't have to wait, pick a winner.
                medState.decision = medState.heardFrom[0];
            }
        }
    }

    step() {
        //go through all mediation requests, increment the time since request and responsd if time thresholds met:
        for (let request of this.mediation_requests) {
            
            
            let medState = this.mediation_states[request.podName];
            
            if(!medState) {
                medState = new MediationState(request.podName, request.requestId);
                this.mediation_states[request.podName] = medState;
            }

            //see if we have this array in heardfrom
            if (!medState.heardFrom.includes(request.arrayName)) {
                medState.heardFrom.push(request.arrayName);
            }

    

            request.timeSinceRequest += 1;
            if (medState.timeSinceRequest < request.timeSinceRequest) {
                medState.timeSinceRequest = request.timeSinceRequest;
            }
            
            //if request id is lower we reject it
            if(request.requestId < medState.requestId) {
                this.sendLostResponse(request);
                continue;
            } else if (request.requestId > medState.requestId) {
            //if request id is higher, we reset the state
                medState = new MediationState(request.podName, request.requestId);
                this.mediation_states[request.podName] = medState;
            }
            
            //matching lets try and make a decision
            this.makeDecision(request, medState);
            
            if (medState.decision) {
               if(medState.decision === request.arrayName) {
                    this.sendWonResponse(request, medState);
                } else {   
                    this.sendLostResponse(request, medState);
                }
            }
        }
            
    }
}

class PodArrayStates {
    constructor(array, state) {
        this.array = array;
        this.state = state; // "baselining", "synced", "offline", "re-syncing"
        this.preElected = false;
        this.fa_connected = false;
        this.mediator_connected = false;
        this.elected = false;
        this.state_timers = {};
        this.state_timer_thresholds = {};
        this.state_timer_thresholds["baselining"] = 2;
    }

    incrementTimerisDone() {
        //check if state is in dictionary, and it's a number
        if (!(this.state in this.state_timers) || typeof this.state_timers[this.state] !== "number") {
            this.resetStateTimer(this.state);
        }

        this.state_timers[this.state] += 1;
        if ( this.state_timers[this.state] >= this.state_timer_thresholds[this.state]) {
            //delete the timer and return true
            delete this.state_timers[this.state];
            return true;
        }
        return false;
    }

    resetStateTimer() {
        this.state_timers[this.state] = 0;
    }
}




class ActiveClusterPod extends NetworkDevice {
    constructor(name, mediator, mediatorPort) {
        super(name);
        this.mediator = mediator;
        this.mediatorPort = mediatorPort;
        this.volumes = [];
        this.array_states = {};
        this.stetched = false;
        this.failoverPreference = null;
        this.mediation_request_id = 0;  // increment for each mediation response.
    }

    isFowarding(faControllerObj) {
        let array = faControllerObj.fa;
        let otherArray = this.getOtherArray(array.name);

        if (this.array_states[array.name].state === "synced" && this.array_states[otherArray.name].state === "synced") {
            if (this.array_states[array.name].fa_connected && this.array_states[otherArray.name].fa_connected) {
                //shouldn't have to check this but... Let check and log if it happens
                return true;
            }
            else {
                console.log("Array [" + array.name + "] pod [" + this.name + "] is not forwarding because loss of heartbeat with other array");
            }
        }
        return false;
    }
    
    isWriting(faControllerObj) {
        return this.array_states[faControllerObj.fa.name].state === "synced";
    }

    isStretched() {
        // if there are 2 arrays in array_states, then the pod is stretched
        return Object.keys(this.array_states).length > 1;
    }

    ac_write(packet, srcPort, faController) {
        if (this.isFowarding(faController)) {
            let acmessage = new ACMessage(this);
            acmessage.srcPort = srcPort;
            acmessage.original_packet = packet;
            faController.acSendData(this, "ac_write", acmessage);
        } else if (this.isWriting(faController)) {
            srcPort.sendResponsePacket(packet, "write_ack", packet.data);
        }
        //else we do nothing, don't return anything
    }

    isPreferredArray(array) {
        if (this.failoverPreference) {
            return array.name === this.failoverPreference.name;
        }
        return false;
    }

    //add and/or stretch Pod.
    addArray(arrayObj) {
        //check if already in arrays:
        if (arrayObj.name in this.array_states) {
            console.log("Array already in Pod");
            return;
        }
        
        // check lenght of arrays:
        if (Object.keys(this.array_states).length > 1) {
            console.log("Can't stretch Pod, already 2 arrays");
            return;
        }

        // check lenght of arrays:
        if (Object.keys(this.array_states).length === 0) {
            this.array_states[arrayObj.name] = new PodArrayStates(arrayObj, "synced");
            this.array_states[arrayObj.name].preElected = true;
            this.setStateSynced(arrayObj.name);
            
        } else {

            this.array_states[arrayObj.name] = new PodArrayStates(arrayObj, "added");
            this.stetched = true;
        }
        //check if pod already in array;
        if (this.name in arrayObj.pods) {
            console.log("Pod already in array");
        } else {
            arrayObj.pods[this.name] = this;
        }
    }

    //unstretch Pod
    removeArray(arrayObj) {
        //check that the array is in dictionary:
        if (!(arrayObj.name in this.array_states)) {
            console.log("Array not in Pod, can't unstretch");
            return;
        }

        //check that there are more than 1 entires is this.arrays:
        if (Object.keys(this.array_states).length <= 1) {
            console.log("Can't unstretch, only 1 array in Pod");
            return;
        }

        //for each volume in the pod check if it's in a hostEntry:
        for (let volume of this.volumes) {
            //check if volume is in a hostEntry:
            for (let hostEntry of arrayObj.hostEntries) {
                if (hostEntry.cotainsVolume(volume)) {
                    console.log("Can't unstretch, volume " + volume.name + " is in a hostEntry");
                    return;
                }
            }
        }

        //remove array from pod:
        delete this.array_states[arrayObj.name];
        delete arrayObj.pods[this.name];
        this.streched = false;
    }

    getOtherArray(arrayName) {
        //this.array is a dictionary, where arrayname is the key and array is the value
        //iterate through this.arrays(dictionary) and return the array that doesn't match array.
        //get keys of this.arrays
        let arrayNames = Object.keys(this.array_states);
        //iterate through arrayNames and return the array that doesn't match arrayName
        for (let name of arrayNames) {
            if (name !== arrayName) {
                return this.array_states[name].array;
            }
        }
        
    }

    getOtherArrayStates(arrayName) {
        let otherArray = this.getOtherArray(arrayName);
        if (otherArray) {
            return this.array_states[otherArray.name];
        }
        return null;
    }


    addVolume(volumeName) {
        volumeName = volumeName.toLowerCase();

        //add "podname::" if missing
        if (!volumeName.includes("::")) {
            volumeName = this.name + "::" + volumeName;
        } else {
            let podName = volumeName.split("::")[0];
            if ( podName !== this.name ) {
                console.log("Volume name has incorrect pod name");
                return;
            }
        }
        // check if already exists:
        if (volumeName in this.volumes) {
            console.log("Volume already in Pod");
            return;
        }
        //add to volumes
        this.volumes.push(volumeName);
    }

    addFailoverPreference(array) {
        this.failoverPreference = array.name;
    }

    removeFailoverPreference() {
        this.failoverPreference = null;
    }

    containsVolume(volume) {
        //volume name in form of "<pod>::<volume>"
        return this.volumes.includes(volume);
    }


    isVolumeAvailable(volume, arrayName) {
        //volume name in form of "<pod>::<volume>"
        //check array state is synced:
        if (this.volumes.includes(volume)) {

            if(this.array_states[arrayName].state === "synced") {
                return true;
            }
        }
        return false;
    }


    acStep(faController){
        //ActiveCluster
        // for each pod, get the primary controller
        //if the pod is not stretched, then we don't need to do anything
        if (!this.isStretched) {
            return;
          }
    
        let arrayName = faController.fa.name;
        let states = this.array_states[arrayName];
  
        //check for heartbeats
        let acmessage = new ACMessage(this);
        states.fa_connected = false;
        states.mediator_connected = false;
        faController.acSendData(this, "ac_heartbeat", acmessage);
        faController.acSendMed(this, "ac_mediator_heartbeat", acmessage);
        
        let otherArrayStates = this.getOtherArrayStates(arrayName)

        if (states.fa_connected) {
        //because we are connected now, we can look at the other array state to help figure out what to do:
            
            if (otherArrayStates.state === "synced") {
                switch(states.state) {
                case "added":
                    states.state = "baselining";
                    states.resetStateTimer();
                    console.log("Array [" + arrayName + "] pod [" + this.name + "] is " + states.state);
                    break;
                case "baselining":
                    if(states.incrementTimerisDone()) {
                        
                        this.setStateSynced(arrayName);
                        //sync mediation request ids
                       
                    }
                    //log
                    console.log("Array [" + arrayName + "] pod [" + this.name + "] is " + states.state);
                    break;

                case "offline":
                    states.state = "re-syncing";
                    console.log("Array [" + arrayName + "] pod [" + this.name + "] is " + states.state);
                    break;

                case "re-syncing":
                    this.setStateSynced(arrayName);
                    console.log("Array [" + arrayName + "] pod [" + this.name + "] is " + states.state);
                    break;

                case "paused":
                    //Othere array is synced, so we go to re-syncing
                    states.state = "re-syncing";
                    console.log("Array [" + arrayName + "] pod [" + this.name + "] is " + states.state);
                    break;

                case "synced":
                    //check for pre-election
                    this.preElect(faController);
                }
            } //end of "synced"
            else if (otherArrayStates.state === "paused") {
                switch(states.state) {
                case "paused":
                    // both were paused, i'm the first to bring things online, so i'm in sync
                    pod.array_states[arrayName].state = "synced";
                    this.mediation_request_id += 1;  //increment so all previous mediation requests are ignored
                    states.mediation_request_id = this.mediation_request_id; //sync mediation request ids
                    console.log("Array [" + arrayName + "] pod [" + this.name + "] is " + states.state);
                    break;
                default:
                    //not sure how we get here, lets log amessage:
                    console.log("Array [" + arrayName + "] is paused, but other array is not paused or synced, so we can't do anything")
                }
            }
        } //end of if (pod_state.fa_connected)  
        else {
            // no fa connection
            switch(states.state) {
                case "synced":
                    if (!states.elected) {
                        if (states.preElected) {
                            states.elected = true;
                            console.log("Array [" + arrayName + "] pod [" + this.name + "] is elected!");
                        } else if (otherArrayStates.preElected) {
                            states.state = "offline";
                            console.log("Array [" + arrayName + "] pod [" + this.name + "] is " + states.state +":Other array was pre-elected");
                        } else {
                            states.state = "paused";
                            console.log("Array [" + arrayName + "] pod [" + this.name + "] is " + states.state +":No pre-election");
                        }   
                    }
                    break;
                case "paused":
                    //send mediation request
                    //check if peer is pre-elected

                    let mediation_request = new MediationRequest(faController.fa.name, this, states.mediation_request_id);
                    if (!states.mediator_response) {

                        faController.acSendMed(this, "ac_mediation_request", mediation_request);
                        console.log("Array [" + arrayName + "] pod [" + this.name + "] is " + states.state);
                        console.log("Array [" + arrayName + "] pod contactiing Mediator.");
                    } else if (states.mediator_won) {
                        this.setStateSynced(arrayName);
                        console.log("Array [" + arrayName + "] pod [" + this.name + "]  Cloud Mediation won");
                        console.log("Array [" + arrayName + "] pod [" + this.name + "] is " + states.state);
                    } else {
                        states.state = "offline";
                        console.log("Array [" + arrayName + "] pod [" + this.name + "]  Cloud Mediation lost");
                        console.log("Array [" + arrayName + "] pod [" + this.name + "] is " + states.state);
                    }
                    break;
                
            }
        }
        
    
      }

      preElect(faController) {
        let arrayName = faController.fa.name;
        let states = this.array_states[arrayName];
        let otherArrayStates = this.getOtherArrayStates(arrayName);

        if (!states.mediator_connected && !otherArrayStates.mediator_connected ) {
            if ( 
            !otherArrayStates.preElected && !otherArrayStates.elected && 
            !states.preElected && !states.elected) {
            //check if no array is pre-elected
            
                //find an element with preElected true in this.array_states[] with preElected set to true
                let preElectedArray = Object.keys(this.array_states).find(key => this.array_states[key].preElected);
                if (preElectedArray) {
                    return; //we already have a preElected array
                }
                
                if(this.failoverPreference)
                {
                    this.array_states[this.failoverPreference].preElected = true;
                    //log event:
                    console.log("Array [" + this.failoverPreference + "] pod [" + this.name + "] is pre-elected by Failover Prefeerence");
                } else {
                //pick an array at random:
                    let arrayNames = Object.keys(this.array_states);
                    let arrayName = arrayNames[Math.floor(Math.random() * arrayNames.length)];
                    this.array_states[arrayName].preElected = true;
                    console.log("Array [" + arrayName + "] pod [" + this.name + "] is pre-elected by random, no Failover Preference set");
                }
            }
        } else { //meaning someone has access to the mediator
            //clear preElected flag
            //clear elected flags
            this.clearElections(faController);
        }
    }

    setStateSynced(arrayName) {
        //check if all arrays are in state synced

        let states = this.array_states[arrayName];
        states.mediation_request_id = this.mediation_request_id;
        states.mediator_response = false;
        states.mediator_won = false;
        states.state = "synced";
    }

    clearElections(faController) {
        let arrayName = faController.fa.name;
        let states = this.array_states[arrayName];
        let otherArrayStates = this.getOtherArrayStates(arrayName);
        
        if (this.isFowarding(faController)) {
            //this.array_states is a dictionary, iterate through the objects and clear the preElected and elected flags
            for (let name in this.array_states) {
                let arrayState = this.array_states[name];
                if (arrayState.preElected) {
                    arrayState.preElected = false;
                    //log
                    console.log("Array [" + arrayState.array.name + "] pod [" + this.name + "] is no longer pre-elected");
                }
                if (arrayState.elected) {
                    arrayState.elected = false;
                    //log
                    console.log("Array [" + arrayState.array.name + "] pod [" + this.name + "] is no longer elected");
                }



            }
        }
    }
}

