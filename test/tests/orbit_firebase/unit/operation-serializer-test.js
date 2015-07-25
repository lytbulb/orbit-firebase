import Orbit from 'orbit/main';
import OperationSerializer from 'orbit-firebase/operation-serializer';
import FirebaseSerializer from 'orbit-firebase/firebase-serializer';
import OperationEncoder from 'orbit-common/operation-encoder';
import Schema from 'orbit-common/schema';
import { uuid } from 'orbit/lib/uuid';
import { Promise } from 'rsvp';

var schemaDefinition = {
  modelDefaults: {
    keys: {
      '__id': {primaryKey: true, defaultValue: uuid}
    }
  },
  models: {
    planet: {
      attributes: {
        name: {type: 'string'},
        classification: {type: 'string'}
      },
      links: {
        moons: {type: 'hasMany', model: 'moon', inverse: 'planet', actsAsSet: true},
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

var operationSerializer,
    operationEncoder,
    firebaseSerializer,
    schema;

module("OF - OperationSerializer", {
  setup: function() {
    Orbit.Promise = Promise;

    schema = new Schema(schemaDefinition);
    operationEncoder = new OperationEncoder(schema);
    firebaseSerializer = new FirebaseSerializer(schema);

    operationSerializer = new OperationSerializer(firebaseSerializer);
  },

  teardown: function() {
    schema = null;
    operationSerializer = null;
  }
});

test("it should serialize records in add record operations", function(){
  var record = { id: 'pluto', name: 'Pluto' };
  var normalizedRecord = schema.normalize('planet', record);

  var addRecordOp = operationEncoder.addRecordOp('planet', 'pluto', normalizedRecord);
  var serialized = operationSerializer.serialize(addRecordOp);

  deepEqual(serialized.value, firebaseSerializer.serialize('planet', normalizedRecord));
});
