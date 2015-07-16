import { Class } from 'orbit/lib/objects';
import Orbit from 'orbit/main';
import OC from 'orbit-common/main';
import { assert } from 'orbit/lib/assert';
import { isArray, isObject, expose } from 'orbit/lib/objects';
import Source from 'orbit-common/source';
import { pluck, map } from 'orbit-firebase/lib/array-utils';

import Operation from 'orbit/operation';

import FirebaseClient from './firebase-client';
import FirebaseRequester from './firebase-requester';
import FirebaseTransformer from './firebase-transformer';
import FirebaseSerializer from './firebase-serializer';
import FirebaseListener from './firebase-listener';
import CacheSource from './cache-source';
import OperationMatcher from './operation-matcher';
import OperationDecomposer from './operation-decomposer';
import OperationSequencer from './operation-sequencer';
import OperationEncoder from 'orbit-common/operation-encoder';
import OperationFilter from 'orbit-firebase/operation-filter';
import SchemaUtils from './lib/schema-utils';
import { fop } from './lib/operation-utils';


export default Source.extend({
	notifierName: "firebase-source",

	init: function(schema, options){
		var _this = this;
		options = options || {};

		this._super.apply(this, arguments);
		this._cache.maintainInverseLinks = false;

		assert('FirebaseSource requires Orbit.Promise be defined', Orbit.Promise);
		assert('FirebaseSource requires Orbit.all be defined', Orbit.all);
		assert('FirebaseSource requires Orbit.allSettled be defined', Orbit.allSettled);
		assert('FirebaseSource requires Orbit.map be defined', Orbit.map);
		assert('FirebaseSource requires Orbit.resolve be defined', Orbit.resolve);
		assert('FirebaseSource requires firebaseRef be defined', options.firebaseRef);

		var firebaseRef = options.firebaseRef;
		var serializer = new FirebaseSerializer(schema);
		var firebaseClient = new FirebaseClient(firebaseRef);

		this._schemaUtils = new SchemaUtils(this.schema);
		this._firebaseTransformer = new FirebaseTransformer(firebaseClient, schema, serializer, this._cache);
		this._firebaseRequester = new FirebaseRequester(firebaseClient, schema, serializer);
		this._firebaseListener = new FirebaseListener(firebaseRef, schema, serializer);
		_this._operationFilter = new OperationFilter();

		var cacheSource = new CacheSource(this._cache);
		this._operationSequencer = new OperationSequencer(this._cache, schema);

		this._firebaseListener.on('didTransform', function(operation){
			_this._operationSequencer.process(operation);
		});


		this._operationSequencer.on('didTransform', function(operation){
			var inverse = _this._cache.transform(operation);

			if(!_this._operationFilter.blocksNext(operation)){
				_this.didTransform(operation, inverse);
			}
		});

		this._operationEncoder = new OperationEncoder(schema);

		this.on("didTransform", function(operation){
			// console.log("fb.transmitting", operation.path.join("/"), operation.value);
		});
	},

	disconnect: function(){
		return this._firebaseListener.unsubscribeAll();
	},

	_transform: function(operation){
		// console.log("fb.transform", operation.serialize());
		var _this = this;

		if(this._isIgnoredOperation(operation)) return Orbit.resolve();

		this._operationFilter.blockNext(operation);
		return this._firebaseTransformer.transform(operation).then(function(result){

			if(operation.op === "add" && operation.path.length === 2){
				var type = operation.path[0];
				var allLinks = _this._schemaUtils.linksFor(type);
				_this._subscribeToRecords(type, result, {include: allLinks});
				return _this._firebaseListener;
			}

			else if(operation.op !== "remove" && operation.path.length === 2){
				operation.value = _this.schema.normalize(operation.path[0], operation.value);
			}

		}).then(function(){
			_this._operationSequencer.process(operation);
		});
	},

	_isIgnoredOperation: function(operation){
		var operationType = this._operationEncoder.identify(operation);

		switch(operationType){
			case 'addHasOne':
			case 'replaceHasOne':
			case 'addHasMany':
			case 'replaceHasMany':
				return operation.value === OC.LINK_NOT_INITIALIZED;

			default: return false;
		}
	},

	_find: function(type, id, options){
		var _this = this;
		return this._firebaseRequester.find(type, id).then(function(records){
			if(!id) _this._firebaseListener.subscribeToType(type, null, options);
			_this._subscribeToRecords(type, records, options);

      return _this._firebaseListener.then(function(){
        return _this.settleTransforms();
      })
      .then(function(){
        return records;

      });
		});
	},

	_findLink: function(type, id, link){
		// todo - why are no subscriptions created? maybe irrelevant
		return this._firebaseRequester.findLink(type, id, link);
	},

	_findLinked: function(type, id, link, options){
		// console.log("fb._findLinked", arguments);
		var _this = this;
		var linkedType = this.schema.models[type].links[link].model;

		return this._firebaseRequester.findLinked(type, id, link).then(function(records){
			_this._firebaseListener.subscribeToLink(type, id, link, options);
			return _this._firebaseListener.then(function(){
				return _this.settleTransforms();
			})
			.then(function(){
				return records;

			});
		});
	},

	_subscribeToRecords: function(type, records, options){
		records = isArray(records) ? records : [records];
		return this._firebaseListener.subscribeToRecords(type, pluck(records, 'id'), options);
	}
});
