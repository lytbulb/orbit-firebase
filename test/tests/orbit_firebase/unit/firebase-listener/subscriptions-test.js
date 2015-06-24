/* global Firebase */
import Schema from 'orbit-common/schema';
import FirebaseSerializer from 'orbit-firebase/firebase-serializer';
import FirebaseListener from 'orbit-firebase/firebase-listener';
import FirebaseClient from 'orbit-firebase/firebase-client';
import { uuid } from 'orbit/lib/uuid';
import Orbit from 'orbit/main';
import { captureDidTransform, captureDidTransforms, op, includesAll } from 'tests/test-helper';
import { fop } from 'orbit-firebase/lib/operation-utils';
import { Promise, all, allSettled, resolve } from 'rsvp';
import { buildOptions } from 'orbit-firebase/subscriptions/options';
import { prepareFirebaseClient } from 'tests/test-helper';

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
        name: {type: 'string'},
        restricted: {type: 'boolean'}
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
    stop();
    firebaseListener.unsubscribeAll().then(function(){
      firebaseListener = firebaseClient = null;
      start();
    });
  }
});

test('subscribe to record', function(){
  stop();
  var jupiter = { id: 'planet1', name: 'Jupiter' };

  firebaseClient.set('planet/planet1', jupiter).then(function(){

    firebaseListener.subscribeToRecord('planet', 'planet1').then(function(){
      start();
      includesAll(firebaseListener.subscriptions(), [
        'planet/planet1'
      ]);
    });

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
    firebaseListener.subscribeToRecord('moon', 'moon1', buildOptions({include: ['planet']}));
    firebaseListener.then(function(){
      start();

      includesAll(firebaseListener.subscriptions(), [
        'moon/moon1',
        'planet/planet1',
        'moon/moon1/planet'
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
    firebaseListener.subscribeToRecord('planet', 'planet1', buildOptions({include: ['moons']}));
    return firebaseListener;

  })
  .then(function(){
    start();

    includesAll(firebaseListener.subscriptions(), [
      'moon/moon1',
      'planet/planet1',
      'planet/planet1/moons'
    ]);

  });
});

test('subscribe to record including a hasMany with some restricted members', function(){
  expect(1);
  stop();
  var jupiter = { id: 'planet1', name: 'Jupiter', moons: { 'moon1': true, 'moon2': true } };
  var europa = { id: 'moon1', name: 'Europa', planet: 'planet1' };
  var ganymede = { id: 'moon2', name: 'Ganymede', planet: 'planet1', restricted: true };

  all([
    firebaseClient.set('planet/planet1', jupiter),
    firebaseClient.set('moon/moon1', europa),
    firebaseClient.set('moon/moon2', ganymede)

  ])
  .then(function(){
    firebaseListener.subscribeToRecord('planet', 'planet1', buildOptions({include: ['moons']}));
    return firebaseListener;

  })
  .then(function(){
    start();

    equal(firebaseListener.findSubscription('moon/moon2').status, 'permission_denied', 'access denied to record moon/moon2');

  });
});

test("subscribe to a record when it's added to a hasMany", function(){
  stop();
  var jupiter = { id: 'planet1', name: 'Jupiter' };
  var europa = { id: 'moon1', name: 'Europa' };

  var capture = captureDidTransforms(firebaseListener, 4);

  all([
    firebaseClient.set('planet/planet1', jupiter),
    firebaseClient.set('moon/moon1', europa)

  ])
  .then(function(){
    firebaseListener.subscribeToRecord('planet', 'planet1', buildOptions({include: ['moons']}));
    return firebaseListener;

  })
  .then(function(){
    return firebaseClient.set('planet/planet1/moons/moon1', true);

  });

  capture.then(function(){
    start();
    includesAll(firebaseListener.subscriptions(), [
      'moon/moon1',
      'planet/planet1/moons',
      'planet/planet1'
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
    firebaseListener.subscribeToRecord('moon', 'moon1', buildOptions({include: ['planet']}));
    return firebaseListener;

  })
  .then(function(){
    firebaseClient.set('moon/moon1/planet', 'planet1');
    return firebaseListener;
  })
  .then(function(){
    start();
    includesAll(firebaseListener.subscriptions(), [
      "moon/moon1/planet",
      "moon/moon1",
      "planet/planet1"
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
    firebaseListener.subscribeToRecord('moon', 'moon1', buildOptions({include: ['planet.star']}));

    return firebaseListener;

  })
  .then(function(){
    start();

    includesAll(firebaseListener.subscriptions(), [
      "moon/moon1/planet",
      "moon/moon1",
      "planet/planet1/star",
      "planet/planet1",
      "star/star1"
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
    firebaseListener.subscribeToRecord('star', 'star1', buildOptions({include: ['planets.moons']}));
    return firebaseListener;

  })
  .then(function(){
    start();
    includesAll(firebaseListener.subscriptions(), [
      "moon/moon1",
      "planet/planet1",
      "planet/planet1/moons",
      "star/star1",
      "star/star1/planets"
    ]);

  });
});

test("subscribe to initial nested hasMany records with restrictions", function(){
  stop();
  var sun = { id: 'star1', name: "The Sun", planets: { 'planet1': true } };
  var jupiter = { id: 'planet1', name: 'Jupiter', star: 'star1', moons: {'moon1': true, 'moon2': true} };
  var europa = { id: 'moon1', name: 'Europa', planet: 'planet1' };
  var ganymede = { id: 'moon2', name: 'Ganymede', planet: 'planet1', restricted: true };

  all([
    firebaseClient.set('star/star1', sun),
    firebaseClient.set('planet/planet1', jupiter),
    firebaseClient.set('moon/moon1', europa),
    firebaseClient.set('moon/moon2', ganymede)

  ])
  .then(function(){
    firebaseListener.subscribeToRecord('star', 'star1', buildOptions({include: ['planets.moons']}));
    return firebaseListener;

  })
  .then(function(){
    start();
    includesAll(firebaseListener.subscriptions(), [
      "moon/moon1",
      "moon/moon2",
      "planet/planet1",
      "planet/planet1/moons",
      "star/star1",
      "star/star1/planets"
    ]);

    equal(firebaseListener.findSubscription('moon/moon2').status, 'permission_denied', 'access denied to record moon/moon2');
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
    firebaseListener.subscribeToRecord('star', 'star1', buildOptions({include: ['planets']}));
    return firebaseListener;

  })
  .then(function(){
    firebaseListener.subscribeToRecord('star', 'star1', buildOptions({include: ['planets.moons']}));
    return firebaseListener;
  })
  .then(function(){
    start();
    includesAll(firebaseListener.subscriptions(), [
      "moon/moon1",
      "planet/planet1",
      "planet/planet1/moons",
      "star/star1",
      "star/star1/planets"
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
    firebaseListener.subscribeToRecord('moon', 'moon1', buildOptions({include: ['planet']}));
    return firebaseListener;

  })
  .then(function(){
    firebaseListener.subscribeToRecord('moon', 'moon1', buildOptions({include: ['planet.star']}));
    return firebaseListener;

  }).then(function(){
    start();
    includesAll(firebaseListener.subscriptions(), [
      "moon/moon1/planet",
      "moon/moon1",
      "planet/planet1/star",
      "planet/planet1",
      "star/star1"
    ]);

  });
});

test("subscribe to link", function(){
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
    firebaseListener.subscribeToLink('planet', 'planet1', 'moons');
    return firebaseListener;
  })
  .then(function(){
    start();

    console.group("subscriptions statii");
    for(var key in firebaseListener._subscriptions){
      var subscription = firebaseListener._subscriptions[key];
      console.log(key, subscription.status);
    }
    console.groupEnd();

    includesAll(firebaseListener.subscriptions(), [
      "moon/moon1",
      "planet/planet1/moons"
    ]);
  });

});
