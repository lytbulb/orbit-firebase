import Orbit from 'orbit/main';
import OC from 'orbit-common/main';
import Operation from 'orbit/operation';
import { uuid } from 'orbit/lib/uuid';
import Schema from 'orbit-common/schema';
import Source from 'orbit-common/source';
import Cache from 'orbit-common/cache';
import RelatedInverseLinksProcessor from 'orbit-firebase/related-inverse-links';
import FirebaseSource from 'orbit-firebase/firebase-source';
import { Promise, all, hash, denodeify,resolve, on, defer } from 'rsvp';
import { isArray, isObject } from 'orbit/lib/objects';
import { op } from 'tests/test-helper';

var schema,
    cache,
    relatedInverseLinksProcessor,
    saturn,
    earth,
    titan,
    europa,
    jupiter,
    human,
    martian;

///////////////////////////////////////////////////////////////////////////////

function buildPlanet(properties){
  properties.__rel = {
    moons: {},
    races: {},
    next: null,
    previous: null
  };
  return properties;
}

function buildMoon(properties){
  properties.__rel = {
    planet: null
  };
  return properties;
}

function buildRace(properties){
  properties.__rel = {
    planets: {}
  };
  return properties;
}

module('OC - OperationProcessors - RelatedInverseLinks', {
  setup: function() {
    Orbit.Promise = Promise;

    schema = new Schema({
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
    });

    cache = new Cache(schema, {});
    relatedInverseLinksProcessor = new RelatedInverseLinksProcessor(schema, cache);

    saturn = buildPlanet({id: '10', name: 'Saturn'});
    jupiter = buildPlanet({id: '11', name: 'Jupiter'});
    earth = buildPlanet({id: '12', name: 'Earth'});

    titan = buildMoon({id: '20', name: 'Titan'});
    europa = buildMoon({id: '21', name: 'Europa'});

    human = buildRace({id: '30', name: 'Human'});
    martian = buildRace({id: '31', name: 'Martian'});
  },

  teardown: function() {
    cache = relatedInverseLinksProcessor = null;
  }
});

function stringifyOperations(operations){
  return operations.map(function(operation){
    var value = isObject(operation.value) ? JSON.stringify(operation.value) : operation.value;
    var segments = [operation.op, operation.path.join("/")];
    if(value) segments.push(value);
    return "[" + segments.join(", ") + "]";
  });
}

function operationsShouldMatch(actualOperations, expectedOperations){
  console.log(JSON.stringify({
    actual: stringifyOperations(actualOperations),
    expected: stringifyOperations(expectedOperations)
  }, null, 2));

  equal(actualOperations.length, expectedOperations.length, 'Same number of operations');

  for(var i = 0; i < actualOperations.length; i++){
    var actual = actualOperations[i];
    var expected = expectedOperations[i];
    deepEqual(actual.serialize(), expected.serialize(), "Operation " + i + " matches");
  }
}

function transformCache(){
  [].slice.call(arguments).forEach(function(operation){
    cache.transform(operation);
  });
}

function asHash(k,v){
  var hash = {};
  hash[k] = v;
  return hash;
}

function associateMoonWithPlanet(moon, planet){
  cache.transform( op('add', ['planet', planet.id, "__rel", "moons", moon.id], true) );
  cache.transform( op('add', ['moon', moon.id, "__rel", 'planet'], planet.id) );
}

test('add to hasOne => hasMany', function(){
  transformCache(
    op('add', ['planet', saturn.id], saturn),
    op('add', ['moon', titan.id], titan),
    op('add', ['planet', jupiter.id], jupiter),
    op('add', ['moon', europa.id], europa)
  );

  associateMoonWithPlanet(titan, saturn);
  associateMoonWithPlanet(europa, jupiter);

  operationsShouldMatch(
    relatedInverseLinksProcessor.process(
      op('add', ['moon', europa.id, '__rel', 'planet'], saturn.id)
    ),
    [
      op('remove', ['planet', jupiter.id, '__rel', 'moons', europa.id]),
      op('add', ['moon', europa.id, '__rel', 'planet'], saturn.id),
      op('add', ['planet', saturn.id, '__rel', 'moons', europa.id], true)
    ]
  );
});

test('replace hasOne => hasMany', function(){
  transformCache(
    op('add', ['planet', saturn.id], saturn),
    op('add', ['moon', titan.id], titan),
    op('add', ['planet', jupiter.id], jupiter),
    op('add', ['moon', europa.id], europa)
  );

  associateMoonWithPlanet(titan, saturn);
  associateMoonWithPlanet(europa, jupiter);

  operationsShouldMatch(
    relatedInverseLinksProcessor.process(
      op('replace', ['moon', europa.id, '__rel', 'planet'], saturn.id)
    ),
    [
      op('remove', ['planet', jupiter.id, '__rel', 'moons', europa.id]),
      op('add', ['planet', saturn.id, '__rel', 'moons', europa.id], true),
      op('replace', ['moon', europa.id, '__rel', 'planet'], saturn.id)
    ]
  );
});

test('replace hasOne => unitialized hasMany', function(){
  var saturn = { id: 'saturn', name: "Saturn", __rel: { moons: OC.LINK_NOT_INITIALIZED } };
  var jupiter = { id: 'jupiter', name: "Jupiter", __rel: { moons: OC.LINK_NOT_INITIALIZED } };
  var titan = { id: 'titan', name: "Titan", __rel: { planet: 'saturn' } };
  var europa = { id: 'europa', name: "Europa", __rel: { planet: 'jupiter' } };

  cache.reset({
    planet: { saturn: saturn, jupiter: jupiter },
    moon: { titan: titan, europa: europa }
  });

  operationsShouldMatch(
    relatedInverseLinksProcessor.process(
      op('replace', ['moon', europa.id, '__rel', 'planet'], saturn.id)
    ),
    [
      // op('replace', ['moon', europa.id, '__rel', 'planet'], saturn.id)
      op('remove', ['planet', jupiter.id, '__rel', 'moons', europa.id]),
      op('add', ['planet', saturn.id, '__rel', 'moons', europa.id], true),
      op('replace', ['moon', europa.id, '__rel', 'planet'], saturn.id)      
    ]
  );
});

test('replace hasMany => hasOne with empty array', function(){
  cache.transform(op('add', ['planet', saturn.id], saturn));
  cache.transform(op('add', ['moon', titan.id], titan));

  associateMoonWithPlanet(titan, saturn);

  operationsShouldMatch(
    relatedInverseLinksProcessor.process(
      op('replace', ['planet', saturn.id, '__rel', 'moons'], {})
    ),
    [
      op('remove', ['moon', titan.id, '__rel', 'planet']),
      op('replace', ['planet', saturn.id, '__rel', 'moons'], {})
    ]
  );
});

test('replace hasMany => hasOne with populated array', function(){
  cache.transform(op('add', ['planet', saturn.id], saturn));
  cache.transform(op('add', ['moon', titan.id], titan));
  cache.transform(op('add', ['planet', jupiter.id], jupiter));

  associateMoonWithPlanet(titan, saturn);

  operationsShouldMatch(
    relatedInverseLinksProcessor.process(
      op('replace', ['planet', jupiter.id, '__rel', 'moons'], asHash(titan.id, true))
    ),
    [
      op('remove', ['planet', saturn.id, '__rel', 'moons', titan.id]),
      op('add', ['moon', titan.id, '__rel', 'planet'], jupiter.id),
      op('replace', ['planet', jupiter.id, '__rel', 'moons'], asHash(titan.id, true))
    ]
  );
});

test('add empty hasMany => hasMany', function(){
  var human = { id: 'human', __rel: { planets: {} }};
  var earth = { id: 'earth', __rel: { races: {}  }};

  cache.reset({
    race: { human: human },
    planet: { earth: earth }
  });

  operationsShouldMatch(
    relatedInverseLinksProcessor.process(
      op('add', 'planet/earth/__rel/races', {})
    ),
    [
      op('replace', 'planet/earth/__rel/races', {})
    ]
  );
});

test('add populated hasMany => hasMany', function(){
  var human = { id: 'human', __rel: { planets: {} }};
  var earth = { id: 'earth', __rel: { races: {}  }};

  cache.reset({
    race: { human: human },
    planet: { earth: earth }
  });

  operationsShouldMatch(
    relatedInverseLinksProcessor.process(
      op('add', 'planet/earth/__rel/races', {human: true})
    ),
    [
      op('add', 'race/human/__rel/planets/earth', true),
      op('replace', 'planet/earth/__rel/races', {human: true})
    ]
  );
});

test('replace populated hasMany => hasMany', function(){

  cache.reset({
    race: {
      human: { id: 'human', __rel: { planets: {'earth': true} }},
      predator: { id: 'predator', __rel: { planets: {}}}
    },
    planet: {
      earth: { id: 'earth', __rel: { races: {'human': true}  }}
    }
  });

  operationsShouldMatch(
    relatedInverseLinksProcessor.process(
      op('replace', 'planet/earth/__rel/races', {'predator': true})
    ),
    [
      op('remove', 'race/human/__rel/planets/earth'),
      op('add', 'race/predator/__rel/planets/earth', true),
      op('replace', 'planet/earth/__rel/races', {'predator': true})
    ]
  );
});


test('add hasMany => unitialized hasMany', function(){
  var human = { id: 'human', __rel: { planets: OC.LINK_NOT_INITIALIZED }};
  var earth = { id: 'earth', __rel: { races: { human: true}  }};

  cache.reset({
    race: { human: human },
    planet: { earth: earth }
  });

  operationsShouldMatch(
    relatedInverseLinksProcessor.process(
      op('add', ['planet', earth.id, '__rel', 'races'], {})
    ),
    [
      // op('replace', ['planet', earth.id, '__rel', 'races'], {})
      op('remove', 'race/human/__rel/planets/earth'),
      op('replace', 'planet/earth/__rel/races', {})
    ]
  );
});

test('add hasMany => hasMany', function(){
  cache.reset({
    planet: {
      earth: {id: 'earth', __rel: { races: {human: true} }}
    },
    race: {
      human: {id: 'human', __rel: { planets: {earth: true} }}
    }
  });

  operationsShouldMatch(
    relatedInverseLinksProcessor.process(
      op('add', 'planet/earth/__rel/races', {})
    ),
    [
      op('remove', 'race/human/__rel/planets/earth'),
      op('replace', 'planet/earth/__rel/races', {})
    ]
  );
});

test('replace hasMany => hasMany', function(){
  cache.reset({
    planet: {
      earth: {id: 'earth', __rel: { races: {human: true} }}
    },
    race: {
      human: {id: 'human', __rel: { planets: {earth: true} }}
    }
  });

  operationsShouldMatch(
    relatedInverseLinksProcessor.process(
      op('replace', 'planet/earth/__rel/races', {})
    ),
    [
      op('remove', 'race/human/__rel/planets/earth'),
      op('replace', 'planet/earth/__rel/races', {})
    ]
  );
});

test('remove hasOne => hasMany', function(){
  cache.transform(op('add', 'planet/10', saturn));
  cache.transform(op('add', 'moon/20', titan));
  cache.transform(op('add', 'planet/11', jupiter));
  cache.transform(op('add', 'moon/21', europa));

  associateMoonWithPlanet(titan, saturn);
  associateMoonWithPlanet(europa, jupiter);

  operationsShouldMatch(
    relatedInverseLinksProcessor.process(
      op('remove', ['moon', europa.id, '__rel', 'planet'])
    ),
    [
      op('remove', ['moon', europa.id, '__rel', 'planet']),
      op('remove', ['planet', jupiter.id, '__rel', 'moons', europa.id])
    ]
  );
});

test('remove hasOne => unitialized hasMany', function(){
  var saturn = { id: 'saturn', name: "Saturn", __rel: { moons: { 'titan': true } } };
  var jupiter = { id: 'jupiter', name: "Jupiter", __rel: { moons: OC.LINK_NOT_INITIALIZED } };
  var titan = { id: 'titan', name: "Titan", __rel: { planet: 'saturn' } };
  var europa = { id: 'europa', name: "Europa", __rel: { planet: 'jupiter' } };

  cache.reset({
    planet: { saturn: saturn, jupiter: jupiter },
    moon: { titan: titan, europa: europa }
  });

  operationsShouldMatch(
    relatedInverseLinksProcessor.process(
      op('remove', ['moon', europa.id, '__rel', 'planet'])
    ),
    [
      op('remove', ['moon', europa.id, '__rel', 'planet']),
      op('remove', ['planet', jupiter.id, '__rel', 'moons', europa.id])
    ]
  );
});

test('remove hasMany => hasOne', function(){
  cache.transform(op('add', 'planet/10', saturn));
  cache.transform(op('add', 'moon/20', titan));
  cache.transform(op('add', 'planet/11', jupiter));
  cache.transform(op('add', 'moon/21', europa));

  associateMoonWithPlanet(titan, saturn);
  associateMoonWithPlanet(europa, jupiter);

  operationsShouldMatch(
    relatedInverseLinksProcessor.process(
      op('remove', ['planet', jupiter.id, '__rel', 'moons', europa.id])
    ),
    [
      op('remove', ['planet', jupiter.id, '__rel', 'moons', europa.id]),
      op('remove', ['moon', europa.id, '__rel', 'planet'])
    ]
  );
});

test('add to hasOne => hasOne', function(){
  cache.transform(op('add', ['planet', jupiter.id], jupiter));
  cache.transform(op('add', ['planet', saturn.id], saturn));
  cache.transform(op('add', ['planet', earth.id], earth));

  cache.transform(op('add', ['planet', saturn.id, '__rel', 'next'], jupiter.id));
  cache.transform(op('add', ['planet', jupiter.id, '__rel', 'previous'], saturn.id));

  operationsShouldMatch(
    relatedInverseLinksProcessor.process(
      op('add', ['planet', earth.id, '__rel', 'next'], saturn.id)
    ),
    [
      op('add', ['planet', earth.id, '__rel', 'next'], saturn.id),
      op('add', ['planet', saturn.id, '__rel', 'previous'], earth.id)
    ]
  );
});

// TODO
// test('add to hasOne => unitialized hasOne', function(){
//   var saturn = { id: 'saturn', name: "Saturn", __rel: { moons: {}, next: 'jupiter', previous: OC.LINK_NOT_INITIALIZED } };
//   var jupiter = { id: 'jupiter', name: "Jupiter", __rel: { moons: {}, previous: 'saturn' } };
//   var earth = { id: 'earth', name: "Earth", __rel: { moons: {}, next: 'saturn' } };

//   cache.reset({
//     planet: { saturn: saturn, jupiter: jupiter, earth: earth }
//   });

//   operationsShouldMatch(
//     relatedInverseLinksProcessor.process(
//       op('add', ['planet', earth.id, '__rel', 'next'], saturn.id)
//     ),
//     [
//       op('add', ['planet', earth.id, '__rel', 'next'], saturn.id)
//     ]
//   );
// });

test('add to hasOne => hasOne with existing value', function(){
  cache.transform(op('add', ['planet', jupiter.id], jupiter));
  cache.transform(op('add', ['planet', saturn.id], saturn));
  cache.transform(op('add', ['planet', earth.id], earth));

  cache.transform(op('add', ['planet', saturn.id, '__rel', 'next'], jupiter.id));
  cache.transform(op('add', ['planet', jupiter.id, '__rel', 'previous'], saturn.id));

  operationsShouldMatch(
    relatedInverseLinksProcessor.process(
      op('add', ['planet', earth.id, '__rel', 'next'], jupiter.id)
    ),
    [
      op('remove', ['planet', saturn.id, '__rel', 'next']),
      op('add', ['planet', earth.id, '__rel', 'next'], jupiter.id),
      op('add', ['planet', jupiter.id, '__rel', 'previous'], earth.id)
    ]
  );
});

test('replace hasOne => hasOne with existing value', function(){
  cache.transform(op('add', ['planet', jupiter.id], jupiter));
  cache.transform(op('add', ['planet', saturn.id], saturn));
  cache.transform(op('add', ['planet', earth.id], earth));

  cache.transform(op('add', ['planet', saturn.id, '__rel', 'next'], jupiter.id));
  cache.transform(op('add', ['planet', jupiter.id, '__rel', 'previous'], saturn.id));

  operationsShouldMatch(
    relatedInverseLinksProcessor.process(
      op('replace', ['planet', earth.id, '__rel', 'next'], jupiter.id)
    ),
    [
      op('remove', ['planet', saturn.id, '__rel', 'next']),
      op('add', ['planet', jupiter.id, '__rel', 'previous'], earth.id),
      op('replace', ['planet', earth.id, '__rel', 'next'], jupiter.id)
    ]
  );
});

test('replace hasOne => hasOne with existing value', function(){
  cache.transform(op('add', ['planet', jupiter.id], jupiter));
  cache.transform(op('add', ['planet', saturn.id], saturn));
  cache.transform(op('add', ['planet', earth.id], earth));

  cache.transform(op('add', ['planet', saturn.id, '__rel', 'next'], jupiter.id));
  cache.transform(op('add', ['planet', jupiter.id, '__rel', 'previous'], saturn.id));

  operationsShouldMatch(
    relatedInverseLinksProcessor.process(
      op('replace', ['planet', earth.id, '__rel', 'next'], jupiter.id)
    ),
    [
      op('remove', ['planet', saturn.id, '__rel', 'next']),
      op('add', ['planet', jupiter.id, '__rel', 'previous'], earth.id),
      op('replace', ['planet', earth.id, '__rel', 'next'], jupiter.id)
    ]
  );
});

test('add to hasMany => hasMany', function(){
  var earth = { id: 'earth', name: "Earth", __rel: { races: {} } };
  var human = { id: 'human', name: "Human", __rel: { planets: {} } };

  cache.reset({
    planet: { earth: earth },
    race: { human: human }
  });

  operationsShouldMatch(
    relatedInverseLinksProcessor.process(
      op('add', ['race', human.id, '__rel', 'planets', earth.id], true)
    ),
    [
      op('add', ['race', human.id, '__rel', 'planets', earth.id], true),
      op('add', ['planet', earth.id, '__rel','races', human.id], true)
    ]
  );
});

test('remove from hasMany => hasMany', function(){
  cache.transform( op('add', ['planet', earth.id], earth) );
  cache.transform( op('add', ['race', human.id], human) );
  cache.transform( op('add', ['planet', earth.id, '__rel', 'races', human.id]) );
  cache.transform( op('add', ['race', human.id, '__rel', 'planets', earth.id]) );

  operationsShouldMatch(
    relatedInverseLinksProcessor.process(
      op('remove', ['race', human.id, '__rel', 'planets', earth.id])
    ),
    [
      op('remove', ['race', human.id, '__rel', 'planets', earth.id]),
      op('remove', ['planet', earth.id, '__rel','races', human.id])
    ]
  );
});

test('add record with links', function(){
  var saturn = { id: 'saturn', name: "Saturn", __rel: { moons: {} } };
  var europa = { id: 'europa', name: "Europa", __rel: { planet: null } };
  var jupiter = { id: 'jupiter', name: "Jupiter", __rel: { moons: { 'europa': true }, previous: 'saturn' } };

  cache.reset({
    planet: { saturn: saturn },
    moon: { europa: europa }
  });

  operationsShouldMatch(
    relatedInverseLinksProcessor.process(
      op('add', ['planet', jupiter.id], jupiter)
    ),
    [
      op('add', ['planet', jupiter.id], jupiter),
      op('add', ['moon', 'europa', '__rel', 'planet'], jupiter.id),
      op('add', ['planet', saturn.id, '__rel', 'next'], jupiter.id)
    ]
  );
});


// TODO
// test('remove record with links', function(){
//   var saturn = { id: 'saturn', name: "Saturn", __rel: { next: 'jupiter'} };
//   var europa = { id: 'europa', name: "Europa", __rel: { planet: 'jupiter' } };
//   var jupiter = { id: 'jupiter', name: "Jupiter", __rel: { moons: { 'europa': true }, previous: 'saturn' } };

//   cache.reset({
//     planet: { saturn: saturn, jupiter: jupiter },
//     moon: { europa: europa }
//   });

//   operationsShouldMatch(
//     relatedInverseLinksProcessor.process(
//       op('remove', ['planet', jupiter.id])
//     ),
//     [
//       op('remove', ['planet', jupiter.id]),
//       op('remove', 'moon/europa/__rel/planet'),
//       op('remove', 'planet/saturn/__rel/next')
//     ]
//   );
// });
