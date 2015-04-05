/* global Firebase */
import Schema from 'orbit-common/schema';
import FirebaseSerializer from 'orbit-firebase/firebase-serializer';
import FirebaseListener from 'orbit-firebase/firebase-listener';
import FirebaseClient from 'orbit-firebase/firebase-client';
import { uuid } from 'orbit/lib/uuid';
import Orbit from 'orbit/main';
import { captureDidTransform, captureDidTransforms, op } from 'tests/test-helper';
import { fop } from 'orbit-firebase/lib/operation-utils';
import { Promise, all, resolve } from 'rsvp';
import { buildOptions } from 'orbit-firebase/subscriptions/options';

var schemaDefinition = {
  modelDefaults: {
    keys: {
      'id': {primaryKey: true, defaultValue: uuid}
    }
  },
  models: {
    star: {
      attributes: {
        name: {type: 'string'}
      },
      links: {
        planets: {type: 'hasMany', model: 'planet', inverse: 'star'}
      }
    },
    planet: {
      attributes: {
        name: {type: 'string'},
        classification: {type: 'string'}
      },
      links: {
        moons: {type: 'hasMany', model: 'moon', inverse: 'planet'},
        races: {type: 'hasMany', model: 'race', inverse: 'planets'},
        next: {type: 'hasOne', model: 'planet', inverse: 'previous'},
        previous: {type: 'hasOne', model: 'planet', inverse: 'next'},
        star: {type: 'hasOne', model: 'star', inverse: 'planets'}
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

module("OF - FirebaseListener - subscriptions", {
  setup: function() {
    Orbit.Promise = Promise;
    Orbit.all = all;
    Orbit.resolve = resolve;

    var firebaseRef = new Firebase("https://orbit-firebase.firebaseio.com/test");
    firebaseRef.set(null);
    firebaseClient = new FirebaseClient(firebaseRef);

    schema = new Schema(schemaDefinition);
    var serializer = new FirebaseSerializer(schema);

    firebaseListener = new FirebaseListener(firebaseRef, schema, serializer);
  },

  teardown: function() {
    firebaseListener = firebaseClient = null;
  }
});

function arrayToHash(array, value){
  var hash = {};

  array.forEach(function(item){
    hash[item] = value;
  });

  return hash;
}

function includesAll(a, b){
  deepEqual(arrayToHash(a, true), arrayToHash(b, true));
}

test('subscribe to record', function(){
  stop();
  var jupiter = { id: 'planet1', name: 'Jupiter' };

  firebaseClient.set('planet/planet1', jupiter)
  .then(function(){

    start();

    firebaseListener.subscribeToRecord('planet', 'planet1');

    deepEqual(firebaseListener.subscriptions(), [
      'planet/planet1:value',
      'planet/planet1/name:value',
      'planet/planet1/classification:value'
    ]);

  });
});

test('subscribe to record including a hasOne', function(){
  stop();
  var jupiter = { id: 'planet1', name: 'Jupiter', moons: { 'moon1': true } };
  var europa = { id: 'moon1', name: 'Europa', planet: 'planet1' };

  all([
    firebaseClient.set('planet/planet1', jupiter),
    firebaseClient.set('moon/moon1', europa)

  ])
  .then(function(){
    firebaseListener.subscribeToRecord('moon', 'moon1', buildOptions({include: ['planet']}))
    .then(function(){
      start();
      console.log("===> testing");

      includesAll(firebaseListener.subscriptions(), [
        'moon/moon1:value',
        'moon/moon1/name:value',
        'planet/planet1:value',
        'planet/planet1/name:value',
        'planet/planet1/classification:value',
        'moon/moon1/planet:value'
      ]);

    });
  });
});

test('subscribe to record including a hasMany', function(){
  stop();
  var jupiter = { id: 'planet1', name: 'Jupiter', moons: { 'moon1': true } };
  var europa = { id: 'moon1', name: 'Europa', planet: 'planet1' };

  all([
    firebaseClient.set('planet/planet1', jupiter),
    firebaseClient.set('moon/moon1', europa)

  ])
  .then(function(){
    return firebaseListener.subscribeToRecord('planet', 'planet1', buildOptions({include: ['moons']}));

  })
  .then(function(){
    start();

    includesAll(firebaseListener.subscriptions(), [
      'planet/planet1/classification:value',
      'planet/planet1/moons:child_added',
      'planet/planet1/moons:child_removed',
      'planet/planet1/name:value',
      'planet/planet1:value',
      'moon/moon1:value',
      'moon/moon1/name:value'
    ]);

  });
});

test("subscribe to a record when it's added to a hasMany", function(){
  stop();
  var jupiter = { id: 'planet1', name: 'Jupiter' };
  var europa = { id: 'moon1', name: 'Europa' };

  var capture = captureDidTransforms(firebaseListener, 5, {logOperations: true});

  all([
    firebaseClient.set('planet/planet1', jupiter),
    firebaseClient.set('moon/moon1', europa)

  ])
  .then(function(){
    return firebaseListener.subscribeToRecord('planet', 'planet1', buildOptions({include: ['moons']}));

  })
  .then(function(){
    return firebaseClient.set('planet/planet1/moons/moon1', true);

  });

  capture.then(function(){
    start();
    includesAll(firebaseListener.subscriptions(), [
      'moon/moon1/name:value',
      'moon/moon1:value',
      'planet/planet1/classification:value',
      'planet/planet1/moons:child_added',
      'planet/planet1/moons:child_removed',
      'planet/planet1/name:value',
      'planet/planet1:value'
    ]);
  });
});

test("subscribe to a record when it's hasOne is replaced", function(){
  stop();
  var jupiter = { id: 'planet1', name: 'Jupiter' };
  var europa = { id: 'moon1', name: 'Europa' };

  all([
    firebaseClient.set('planet/planet1', jupiter),
    firebaseClient.set('moon/moon1', europa)

  ])
  .then(function(){
    return firebaseListener.subscribeToRecord('moon', 'moon1', buildOptions({include: ['planet']}));

  })
  .then(function(){
    return firebaseClient.set('moon/moon1/planet', 'planet1');

  })
  .then(function(){
    start();
    includesAll(firebaseListener.subscriptions(), [
      "moon/moon1/name:value",
      "moon/moon1/planet:value",
      "moon/moon1:value",
      "planet/planet1/classification:value",
      "planet/planet1/name:value",
      "planet/planet1:value"
    ]);
  });
});

test("subscribe to initial nested hasOne records", function(){
  stop();
  var sun = { id: 'star1', name: "The Sun", planets: { 'planet1': true } };
  var jupiter = { id: 'planet1', name: 'Jupiter', star: 'star1', moons: {'moon1': true} };
  var europa = { id: 'moon1', name: 'Europa', planet: 'planet1' };

  all([
    firebaseClient.set('star/star1', sun),
    firebaseClient.set('planet/planet1', jupiter),
    firebaseClient.set('moon/moon1', europa)

  ])
  .then(function(){
    return firebaseListener.subscribeToRecord('moon', 'moon1', buildOptions({include: ['planet.star']}));

  })
  .then(function(){
    start();
    includesAll(firebaseListener.subscriptions(), [
      "moon/moon1/name:value",
      "moon/moon1/planet:value",
      "moon/moon1:value",
      "planet/planet1/classification:value",
      "planet/planet1/name:value",
      "planet/planet1/star:value",
      "planet/planet1:value",
      "star/star1/name:value",
      "star/star1:value"
    ]);

  });

});

test("subscribe to initial nested hasMany records", function(){
  stop();
  var sun = { id: 'star1', name: "The Sun", planets: { 'planet1': true } };
  var jupiter = { id: 'planet1', name: 'Jupiter', star: 'star1', moons: {'moon1': true} };
  var europa = { id: 'moon1', name: 'Europa', planet: 'planet1' };

  all([
    firebaseClient.set('star/star1', sun),
    firebaseClient.set('planet/planet1', jupiter),
    firebaseClient.set('moon/moon1', europa)

  ])
  .then(function(){
    return firebaseListener.subscribeToRecord('star', 'star1', buildOptions({include: ['planets.moons']}));

  })
  .then(function(){
    start();
    includesAll(firebaseListener.subscriptions(), [
      "moon/moon1/name:value",
      "moon/moon1:value",
      "planet/planet1/classification:value",
      "planet/planet1/moons:child_added",
      "planet/planet1/moons:child_removed",
      "planet/planet1/name:value",
      "planet/planet1:value",
      "star/star1/name:value",
      "star/star1/planets:child_added",
      "star/star1/planets:child_removed",
      "star/star1:value"
    ]);

  });
});

test("subscribe to added nested hasMany records", function(){
  stop();
  var sun = { id: 'star1', name: "The Sun", planets: { 'planet1': true } };
  var jupiter = { id: 'planet1', name: 'Jupiter', star: 'star1', moons: {'moon1': true} };
  var europa = { id: 'moon1', name: 'Europa', planet: 'planet1' };

  all([
    firebaseClient.set('star/star1', sun),
    firebaseClient.set('planet/planet1', jupiter),
    firebaseClient.set('moon/moon1', europa)

  ])
  .then(function(){
    return firebaseListener.subscribeToRecord('star', 'star1', buildOptions({include: ['planets']}));

  })
  .then(function(){
    return firebaseListener.subscribeToRecord('star', 'star1', buildOptions({include: ['planets.moons']}));

  })
  .then(function(){
    start();
    includesAll(firebaseListener.subscriptions(), [
      "moon/moon1/name:value",
      "moon/moon1:value",
      "planet/planet1/classification:value",
      "planet/planet1/moons:child_added",
      "planet/planet1/moons:child_removed",
      "planet/planet1/name:value",
      "planet/planet1:value",
      "star/star1/name:value",
      "star/star1/planets:child_added",
      "star/star1/planets:child_removed",
      "star/star1:value"
    ]);

  });
});

test("subscribe to added nested hasOne records", function(){
  stop();
  var sun = { id: 'star1', name: "The Sun", planets: { 'planet1': true } };
  var jupiter = { id: 'planet1', name: 'Jupiter', star: 'star1', moons: {'moon1': true} };
  var europa = { id: 'moon1', name: 'Europa', planet: 'planet1' };

  all([
    firebaseClient.set('star/star1', sun),
    firebaseClient.set('planet/planet1', jupiter),
    firebaseClient.set('moon/moon1', europa)

  ])
  .then(function(){
    return firebaseListener.subscribeToRecord('moon', 'moon1', buildOptions({include: ['planet']}));

  })
  .then(function(){
    return firebaseListener.subscribeToRecord('moon', 'moon1', buildOptions({include: ['planet.star']}));

  }).then(function(){
    start();
    includesAll(firebaseListener.subscriptions(), [
      "moon/moon1/name:value",
      "moon/moon1/planet:value",
      "moon/moon1:value",
      "planet/planet1/classification:value",
      "planet/planet1/name:value",
      "planet/planet1/star:value",
      "planet/planet1:value",
      "star/star1/name:value",
      "star/star1:value"
    ]);

  });
});
