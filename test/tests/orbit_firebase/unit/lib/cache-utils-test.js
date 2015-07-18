import Orbit from 'orbit/main';
import CacheUtils from 'orbit-firebase/lib/cache-utils';
import Schema from 'orbit-common/schema';
import { uuid } from 'orbit/lib/uuid';
import Cache from 'orbit-common/cache';
import { op } from 'tests/test-helper';
import { Promise } from 'rsvp';

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

var cacheUtils,
    cache;

module("OF - CacheUtils", {
  setup: function() {
    Orbit.Promise = Promise;
    var schema = new Schema(schemaDefinition);
    cache = new Cache(schema);
    cacheUtils = new CacheUtils(cache);
  },

  teardown: function() {
    cacheUtils = null;
  }
});

test("detects redundent add record", function(){
  cache.reset({
    planet: {
      'pluto': { id: 'pluto', name: 'Pluto' }
    }
  });

  ok(cacheUtils.isRedundent(op('add', 'planet/pluto', {id: 'pluto', name: 'Pluto'})));
});

test("detects redundent add link", function(){
  cache.reset({
    planet: {
      'pluto': { id: 'pluto', __rel: { moons: { 'moon1': true } } }
    }
  });

  ok(cacheUtils.isRedundent(op('add', 'planet/pluto/__rel/moons/moon1', true)));
});

test("detects redundent replace link", function(){
  cache.reset({
    planet: {
      'pluto': { id: 'pluto', __rel: { moons: { 'moon1': true } } }
    }
  });

  ok(cacheUtils.isRedundent(op('replace', 'planet/pluto/__rel/moons/moon1', true)));
});

test("detects redundent remove record" , function(){
  ok(cacheUtils.isRedundent(op('remove', 'planet/pluto')));
});
