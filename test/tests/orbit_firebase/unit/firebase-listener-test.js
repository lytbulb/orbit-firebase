/* global Firebase */
import Schema from 'orbit-common/schema';
import FirebaseSerializer from 'orbit-firebase/firebase-serializer';
import FirebaseListener from 'orbit-firebase/firebase-listener';
import FirebaseClient from 'orbit-firebase/firebase-client';
import { uuid } from 'orbit/lib/uuid';
import Orbit from 'orbit/main';
import { captureDidTransform, captureDidTransforms, op, prepareFirebaseClient, operationsSink, shouldIncludeOperation, shouldNotIncludeOperation } from 'tests/test-helper';
import { fop } from 'orbit-firebase/lib/operation-utils';
import { Promise, all, allSettled, resolve } from 'rsvp';
import Operation from 'orbit/operation';

var schemaDefinition = {
  modelDefaults: {
    keys: {
      'id': {primaryKey: true, defaultValue: uuid}
    }
  },
  models: {
    planet: {
      attributes: {
        name: {type: 'string'},
        classification: {type: 'string'}
      },
      links: {
        moons: {type: 'hasMany', model: 'moon', inverse: 'planet'},
        races: {type: 'hasMany', model: 'race', inverse: 'planets'},
        next: {type: 'hasOne', model: 'planet', inverse: 'previous'},
        previous: {type: 'hasOne', model: 'planet', inverse: 'next'}
      }
    },
    moon: {
      attributes: {
        name: {type: 'string'}
      },
      links: {
        planet: {type: 'hasOne', model: 'planet', inverse: 'moons'}
      }
    },
    race: {
      attributes: {
        name: {type: 'string'},
      },
      links: {
        planets: {type: 'hasMany', model: 'planet', inverse: 'races'}
      }
    }
  }
};

var firebaseClient,
    firebaseListener,
    schema,
    cache;

module("OF - FirebaseListener", {
  setup: function() {
    Orbit.Promise = Promise;
    Orbit.all = all;
    Orbit.allSettled = allSettled;
    Orbit.resolve = resolve;

    schema = new Schema(schemaDefinition);
    var serializer = new FirebaseSerializer(schema);

    stop();
    prepareFirebaseClient().then(function(preparedFirebaseClient){
      firebaseClient = preparedFirebaseClient;
      firebaseListener = new FirebaseListener(firebaseClient.firebaseRef, schema, serializer);
      start();
    });
  },

  teardown: function() {
    firebaseListener.unsubscribeAll();
    firebaseListener = firebaseClient = null;
  }
});

test("receive add record operation", function(){
  stop();
  firebaseListener.subscribeToType('planet', "abc123");

  var planet = schema.normalize('planet', {id: "abc123", name: "Pluto"});
  var receiveOperation = captureDidTransform(firebaseListener, 3  );

  firebaseClient.set('planet/abc123', planet);

  receiveOperation.then(function(operation){
    start();
    equal(operation.op, 'add', "op matches");
    deepEqual(operation.path, ['planet', 'abc123'], "path matches");
    deepEqual(operation.value.id, planet.id, "record matches");
  });
});

test("receive remove record operation", function(){
  stop();
  firebaseListener.subscribeToType('planet', "abc123");

  var planet = schema.normalize('planet', {id: "abc123", name: "Pluto"});

  var receiveOperation = captureDidTransform(firebaseListener, 4);

  firebaseClient.set('planet/abc123', planet);
  firebaseClient.remove('planet/abc123');

  receiveOperation.then(function(receivedOperation){
    start();
    equal(receivedOperation.op, 'remove', "op matches");
    deepEqual(receivedOperation.path, ['planet', 'abc123'], "path matches");
  });
});

test("receive update attribute operation", function(){
  stop();
  firebaseListener.subscribeToType('planet');

  var planet = schema.normalize('planet', {id: "abc123", name: "Pluto"});

  var receiveOperation = captureDidTransform(firebaseListener, 3);
  firebaseClient.set('planet/abc123', planet);
  firebaseClient.set('planet/abc123/name', "Jupiter");

  receiveOperation.then(function(receivedOperation){
    start();
    equal(receivedOperation.op, 'replace', "op matches");
    deepEqual(receivedOperation.path, ['planet', 'abc123', 'name'], "path matches");
    equal(receivedOperation.value, "Jupiter", "attribute value matches");
  });
});

test("receive replace hasOne operation", function(){
  stop();
  firebaseListener.subscribeToType('moon', null, {include: ['planet']});
  var moon = schema.normalize('moon', {id: "moon123", name: "titan"});
  var planet = schema.normalize('planet', {id: "planet456", name: "jupiter"});

  var receiveOperations = captureDidTransforms(firebaseListener, 8);

  firebaseClient.set('moon/moon123', moon);
  firebaseClient.set('planet/planet456', planet);
  firebaseClient.set('moon/moon123/planet', planet.id);


  receiveOperations.then(function(receivedOperations){
    start();
    shouldIncludeOperation(op('replace', 'moon/moon123/__rel/planet', 'planet456'), receivedOperations);
  });
});

test("receive remove hasOne operation", function(){
  stop();
  firebaseListener.subscribeToType('moon', null, {include: ['planet']});
  var moon = schema.normalize('moon', {id: "moon123", name: "titan"});
  var planet = schema.normalize('planet', {id: "planet456", name: "jupiter"});

  var receiveOperations = captureDidTransforms(firebaseListener, 3);

  firebaseClient.set('moon/moon123', moon);
  firebaseClient.set('planet/planet456', planet);
  firebaseClient.remove('moon/moon123/planet');

  receiveOperations.then(function(receivedOperations){

    start();
    shouldIncludeOperation(op('add', 'moon/moon123/__rel/planet', null), receivedOperations);
  });
});

test("receive add to hasMany operation", function(){
  stop();
  firebaseListener.subscribeToType('planet', null, {include: ['moons']});

  var moon = schema.normalize('moon', {id: "moon123", name: "titan"});
  var planet = schema.normalize('planet', {id: "planet456", name: "jupiter"});

  var receiveOperations = captureDidTransforms(firebaseListener, 8);

  firebaseClient.set('moon/moon123', moon);
  firebaseClient.set('planet/planet456', planet);
  firebaseClient.set('planet/planet456/moons/moon123', true);

  receiveOperations.then(function(receivedOperations){
    start();
    shouldIncludeOperation(op('add', 'planet/planet456/__rel/moons/moon123', true), receivedOperations);
  });
});

test("receive remove from hasMany operation", function(){
  stop();
  firebaseListener.subscribeToType('planet', null, {include: ['moons']});

  var moon = schema.normalize('moon', {id: "moon123", name: "titan"});
  var planet = schema.normalize('planet', {id: "planet456", name: "jupiter"});

  var receiveOperations = captureDidTransforms(firebaseListener, 9);

  all([
    firebaseClient.set('moon/moon123', moon),
    firebaseClient.set('planet/planet456', planet),
    firebaseClient.set('planet/planet456/moons/moon123', true)
  ])
  .then(function(){
    return firebaseClient.remove('planet/planet456/moons/moon123');
  });

  receiveOperations.then(function(receivedOperations){
    start();
    var removeFromHasManyOperation = new Operation({op: 'remove', path: 'planet/planet456/__rel/moons/moon123'});
    shouldIncludeOperation(removeFromHasManyOperation, receivedOperations);
  });
});

test("subscribe to hasMany link", function(){
  stop();

  var moon = schema.normalize('moon', {id: "moon123", name: "titan", planet: 'planet456'});
  var planet = schema.normalize('planet', {id: "planet456", name: "jupiter", moons: {'moon123': true}});

  all([
    firebaseClient.set('moon/moon123', moon),
    firebaseClient.set('planet/planet456', planet)
  ])
  .then(function(){
    var receiveOperation = captureDidTransforms(firebaseListener, 8);

    firebaseListener.subscribeToLink('planet', 'planet456', 'moons');

    receiveOperation.then(function(receivedOperations){
      start();

      shouldIncludeOperation(op('add', 'planet/planet456/__rel/moons', {'moon123': true}), receivedOperations);
      shouldIncludeOperation(op('add', 'moon/moon123/__rel/planet', 'planet456'), receivedOperations);
      shouldIncludeOperation(op('add', 'planet/planet456/__rel/moons/moon123', true), receivedOperations);
    });

  });

});

test("update hasMany subscription", function(){
  stop();

  var moon = schema.normalize('moon', {id: "moon123", name: "titan", planet: 'planet456'});
  var planet = schema.normalize('planet', {id: "planet456", name: "jupiter", moons: {'moon123': true}});

  all([
    firebaseClient.set('moon/moon123', moon),
    firebaseClient.set('planet/planet456', planet)
  ])
  .then(function(){
    var receiveOperations = captureDidTransforms(firebaseListener, 8);
    firebaseListener.subscribeToLink('planet', 'planet456', 'moons');
    return receiveOperations;
  })
  .then(function(){
    var receivedOperations = operationsSink(firebaseListener);
    firebaseListener.subscribeToLink('planet', 'planet456', 'moons', {include: ['planet']});
    return receivedOperations;
  })
  .then(function(receivedOperations){
      start();
      shouldNotIncludeOperation(op('add', 'planet/planet456/__rel/moons', {'moon123': true}), receivedOperations);
  });

});

test("subscribe to hasOne link", function(){
  stop();

  var moon = schema.normalize('moon', {id: "moon123", name: "titan", planet: 'planet456'});
  var planet = schema.normalize('planet', {id: "planet456", name: "jupiter", moons: {'moon123': true}});

  all([
    firebaseClient.set('moon/moon123', moon),
    firebaseClient.set('planet/planet456', planet)
  ])
  .then(function(){
    var receiveOperations = captureDidTransforms(firebaseListener, 8);

    firebaseListener.subscribeToLink('moon', 'moon123', 'planet');

    receiveOperations.then(function(receivedOperations){
      start();

      shouldIncludeOperation(op('add', 'moon/moon123/__rel/planet', 'planet456'), receivedOperations);
    });

  });

});

test("receive update to hasOne link", function(){
  stop();

  var titan = schema.normalize('moon', {id: "titan", name: "titan", planet: 'jupiter'});
  var jupiter = schema.normalize('planet', {id: "jupiter", name: "Jupiter", moons: {'titan': true}});
  var saturn = schema.normalize('planet', {id: "saturn", name: "Saturn", moons: {}});
  var receiveOperations = captureDidTransforms(firebaseListener, 14);

  all([
    firebaseClient.set('moon/titan', titan),
    firebaseClient.set('planet/jupiter', jupiter),
    firebaseClient.set('planet/saturn', saturn)
  ])
  .then(function(){
    return firebaseListener.subscribeToLink('moon', 'titan', 'planet');
  })
  .then(function(){
    return firebaseClient.set('moon/titan/planet', 'saturn');
  });

  receiveOperations.then(function(receivedOperations){
      start();
      shouldIncludeOperation(op('replace', 'moon/titan/__rel/planet', 'saturn'), receivedOperations);
  });

});
