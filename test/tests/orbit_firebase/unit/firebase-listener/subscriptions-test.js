/* global Firebase */
import Schema from 'orbit-common/schema';
import FirebaseSerializer from 'orbit-firebase/firebase-serializer';
import FirebaseListener from 'orbit-firebase/firebase-listener';
import FirebaseClient from 'orbit-firebase/firebase-client';
import { uuid } from 'orbit/lib/uuid';
import Orbit from 'orbit/main';
import { captureDidTransform, captureDidTransforms, op } from 'tests/test-helper';
import { fop } from 'orbit-firebase/lib/operation-utils';

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

module("OF - FirebaseListener - subscriptions", {
  setup: function() {
    Orbit.Promise = Promise;

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

test("subscribe to record adds subscriptions for the record and it's attributes", function(){
  var jupiter = { id: "planet1", name: "Jupiter" };
  firebaseClient.set('planet/planet1', jupiter);

  firebaseListener.subscribeToRecord('planet', 'planet1');
  deepEqual(firebaseListener.subscriptions(), [
    'planet/planet1:value',
    "planet/planet1/name:value",
    "planet/planet1/classification:value"
  ]);
});
