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

var firebaseSerializer,
    schema;

module("OF - FirebaseSerializer", {
  setup: function(){
    Orbit.Promise = Promise;

    schema = new Schema(schemaDefinition);
    firebaseSerializer = new FirebaseSerializer(schema);
  }
});


test("serialize - serializes dates", function(){
  var jupiter = schema.normalize('planet', { id: 'p1', name: "Jupiter", birthDate: new Date(1428555600000) });

  var serialized = firebaseSerializer.serialize('planet', jupiter);

  equal(serialized.birthDate, jupiter.birthDate.getTime(), 'birthDate was serialized');
});

test("serialize - serializes null dates", function(){
  var jupiter = schema.normalize('planet', { id: 'p1', name: "Jupiter" });

  var serialized = firebaseSerializer.serialize('planet', jupiter);

  ok(!serialized.birthDate, 'null birthDate was serialized');
});

test("deserialize - deserializes dates", function(){
  var serializedJupiter = schema.normalize('planet', { id: "p1", name: "Jupiter", birthDate: 1428555600000 });

  var deserialized = firebaseSerializer.deserialize('planet', serializedJupiter.id, serializedJupiter);

  equal(deserialized.birthDate.getTime(), serializedJupiter.birthDate, 'birthDate was deserialized');
});

test("deserialize - deserializes null dates", function(){
  var serializedJupiter = schema.normalize('planet', { id: "p1", name: "Jupiter" });

  var deserialized = firebaseSerializer.deserialize('planet', serializedJupiter.id, serializedJupiter);

  ok(!deserialized.birthDate, 'null birthDate was deserialized');
});

test("deserialize - doesn't initialize links", function(){
  var serializedJupiter = schema.normalize('planet', { id: "p1", name: "Jupiter" });

  var deserialized = firebaseSerializer.deserialize('planet', serializedJupiter.id, serializedJupiter);

  equal(deserialized.moons, undefined, "Moons are undefined");
});
