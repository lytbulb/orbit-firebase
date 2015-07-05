/* global clearTimeout, Firebase */
import Operation from 'orbit/operation';
import { fop, operationToString } from 'orbit-firebase/lib/operation-utils';
import { on, Promise } from 'rsvp';
import Orbit from 'orbit/main';
import FirebaseClient from 'orbit-firebase/firebase-client';
import { arrayToHash } from 'orbit-firebase/lib/array-utils';
import { any } from 'orbit-firebase/lib/array-utils';
import { eq } from 'orbit/lib/eq';

on('error', function(reason){
  console.log(reason);
  console.error(reason.message, reason.stack);
});

function op(opType, path, value){
  var operation = new Operation({op: opType, path: path});
  if(value !== undefined) operation.value = value;
  return operation;
}

function nextEventPromise(emitter, event){
  return new Promise(function(resolve, fail){
    emitter.one(event,
      function(operation){ resolve(operation); },
      function(error){ fail(error); }
    );
  });
}

function captureDidTransform(source, count, options){
  return captureDidTransforms(source, count, options).then(function(operations){
    return operations[operations.length-1];
  });
}

function captureDidTransforms(source, count, options){
  options = options || {};
  return new Promise(function(resolve, reject){
    var operations = [];

    var timeout = setTimeout(function(){

      console.group("Received operations");
      for(var i = 0; i < operations.length; i++){
        console.log("operation " + (i + 1) + ": ", operations[i].serialize());
      }
      console.groupEnd();

      start();
      reject("Failed to receive " + count + " operations (received " + operations.length + ")");
    }, 2500);

    function callback(operation){
      operations.push(operation);

      if(options.logOperations){
        console.log("operation " + operations.length + ": ", fop(operation));
      }

      if(operations.length === count){
        source.off("didTransform", callback);
        clearTimeout(timeout);
        resolve(operations);
      }
    }

    source.on("didTransform", callback, this);
  });
}

function wait(time){
  return new Orbit.Promise(function(resolve){
    setTimeout(resolve, time);
  });
}

function prepareFirebaseClient(){
  var firebaseUrl = "%FIREBASE_URL";
  var firebaseSecret = "%FIREBASE_SECRET";
  var firebaseRef = new Firebase(firebaseUrl);
  var firebaseClient = new FirebaseClient(firebaseRef);

  return firebaseClient
    .authenticateAdmin(firebaseSecret)
    .then(function(){
      return firebaseClient.set("/", null);
    })
    .then(function(){
      return firebaseClient.authenticateUser(firebaseSecret, {uid: "1"});
    })
    .then(function(){
      return firebaseClient;
    });
}

function includesAll(a, b){
  deepEqual(arrayToHash(a, true), arrayToHash(b, true));
}

function operationsSink(source){
  var operations = [];

  source.on("didTransform", function(operation){
    operations.push(operation);
  });

  return operations;
}

function shouldIncludeOperation(operation, operations){
  var present = any(operations, function(candidate){
    return eq(candidate.serialize(), operation.serialize());
  });

  if(!present){
    console.group("operation", operationToString(operation), "not found in...");
    operations.forEach(function(operation){
      console.log(operation.serialize());
    });
    console.groupEnd();
  }

  ok(present, "operation was present: " + operationToString(operation));
}

function shouldNotIncludeOperation(operation, operations){
  var present = any(operations, function(candidate){
    return eq(candidate.serialize(), operation.serialize());
  });

  if(present){
    console.group("operation", operationToString(operation), "found in...");
    operations.forEach(function(operation){
      console.log(operation.serialize());
    });
    console.groupEnd();
  }

  ok(!present, "operation wasn't present: " + operationToString(operation));
}


export { nextEventPromise, op, captureDidTransform, captureDidTransforms, wait, prepareFirebaseClient, includesAll, operationsSink, shouldIncludeOperation, shouldNotIncludeOperation };
