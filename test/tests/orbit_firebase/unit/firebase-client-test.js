/* global Firebase */
import FirebaseClient from 'orbit-firebase/firebase-client';
import Orbit from 'orbit/main';
import { prepareFirebaseClient } from 'tests/test-helper';

var firebaseRef,
    firebaseClient;

module("OF - FirebaseClient", {
  setup: function() {
    Orbit.Promise = Promise;

    stop();
    prepareFirebaseClient().then(function(preparedFirebaseClient){
      firebaseClient = preparedFirebaseClient;
      firebaseRef = firebaseClient.firebaseRef;
      start();
    });
  },

  teardown: function() {
    firebaseRef = firebaseClient = null;
  }
});

test("#set", function(){
	stop();

	firebaseClient.set("/moon/1", "abc").then(function(){
    firebaseRef.child("/moon/1").once('value', function(snapshot){
      start();
      equal(snapshot.val(), "abc", "set value in firebase");
    });
  });
});

test("#push", function(){
  stop();

  firebaseClient.push("/planet", "abc").then(function(){
    firebaseRef.child("/planet").once("value", function(snapshot){
      start();
      var key = Object.keys(snapshot.val())[0];
      equal(snapshot.val()[key], "abc", "value was added to array");
    });
  });
});

test("#remove", function(){
  stop();

  firebaseRef.set("/planet/abc", function(){
    firebaseClient.remove("/planet/abc").then(function(){
      firebaseRef.child("/planet/abc").once("value", function(snapshot){
        start();
        equal(snapshot.val(), null, "value was removed");
      });
    });
  });
});

test("#valueAt", function(){
  stop();

  firebaseRef.child("/planet").set("abc", function(){
    firebaseClient.valueAt("/planet").then(function(value){
      start();
      equal(value, "abc", "value was retrieved");
    });
  });
});

test("#appendToArray - empty array", function(){
  stop();

  firebaseClient.appendToArray("/planet", "abc").then(function(){
    firebaseRef.child("/planet").once("value", function(snapshot){
      start();
      deepEqual(snapshot.val(), ["abc"]);
    });
  });
});

test("#appendToArray - existing array", function(){
  stop();

  firebaseRef.child("/planet").set(["abc"], function(){
    firebaseClient.appendToArray("/planet", "def").then(function(){
      firebaseRef.child("planet").once("value", function(snapshot){
        start();
        deepEqual(snapshot.val(), ["abc", "def"]);
      });
    });
  });
});

test("#removeFromArray", function(){
  stop();

  firebaseRef.child("/planet").set(["abc"], function(){
    firebaseClient.removeFromArray("/planet", "abc").then(function(){
      firebaseRef.child("planet").once("value", function(snapshot){
        start();
        deepEqual(snapshot.val(), null);
      });
    });
  });
});

test("#removeFromArrayAt", function(){
  stop();

  firebaseRef.child("/planet").set(["abc", "def", "ghi"], function(){
    firebaseClient.removeFromArrayAt("/planet", 1).then(function(){
      firebaseRef.child("/planet").once("value", function(snapshot){
        start();
        deepEqual(snapshot.val(), ["abc", "ghi"]);
      });
    });
  });
});
