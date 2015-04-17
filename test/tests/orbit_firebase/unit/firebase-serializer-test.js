import FirebaseSerializer from 'orbit-firebase/firebase-serializer';
import { uuid } from 'orbit/lib/uuid';
import Schema from 'orbit-common/schema';
import { Promise } from 'rsvp';
import Orbit from 'orbit/main';

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
        classification: {type: 'string'},
        birthDate: {type: 'date'}
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

var firebaseSerializer;

module("OF - FirebaseSerializer", {
  setup: function(){
    Orbit.Promise = Promise;

    var schema = new Schema(schemaDefinition);
    firebaseSerializer = new FirebaseSerializer(schema);
  }
});


test("serialize - serializes dates", function(){
  var europa = { id: 'p1', name: "Europa", birthDate: new Date(1428555600000), __rel: {} };

  var serialized = firebaseSerializer.serialize('planet', europa);

  equal(serialized.birthDate, europa.birthDate.getTime(), 'birthDate was serialized');
});

test("serialize - serializes null dates", function(){
  var europa = { id: 'p1', name: "Europa", __rel: {} };

  var serialized = firebaseSerializer.serialize('planet', europa);

  ok(!serialized.birthDate, 'null birthDate was serialized');
});

test("serialize - deserializes dates", function(){
  var serializedEuropa = { id: "p1", name: "Europa", birthDate: 1428555600000 };

  var deserialized = firebaseSerializer.deserialize('planet', serializedEuropa.id, serializedEuropa);

  equal(deserialized.birthDate.getTime(), serializedEuropa.birthDate, 'birthDate was deserialized');
});

test("serialize - deserializes null dates", function(){
  var serializedEuropa = { id: "p1", name: "Europa" };

  var deserialized = firebaseSerializer.deserialize('planet', serializedEuropa.id, serializedEuropa);

  ok(!deserialized.birthDate, 'null birthDate was deserialized');
});
