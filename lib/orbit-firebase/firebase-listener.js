import { Class, expose, isArray, isObject, isNone } from 'orbit/lib/objects';
import { eq } from 'orbit/lib/eq';
import Evented from 'orbit/evented';
import SchemaUtils from 'orbit-firebase/lib/schema-utils';
import Operation from 'orbit/operation';
import FirebaseClient from 'orbit-firebase/firebase-client';
import Orbit from 'orbit/main';
import { map } from 'orbit-firebase/lib/array-utils';
import RecordSubscription from './subscriptions/record-subscription';
import AttributeSubscription from './subscriptions/attribute-subscription';
import HasManySubscription from './subscriptions/has-many-subscription';
import HasOneSubscription from './subscriptions/has-one-subscription';
import { buildOptions } from './subscriptions/options';

export default Class.extend({
	init: function(firebaseRef, schema, serializer){
		Evented.extend(this);

		this._firebaseRef = firebaseRef;
		this._firebaseClient = new FirebaseClient(this._firebaseRef);
		this._schema = schema;
		this._schemaUtils = new SchemaUtils(schema);
		this._serializer = serializer;

		this._listeners = {};
		this._subscriptions = {};
	},

	subscribeToType: function(type, options){
		console.log("subscribing to type", type);
		var _this = this;
		var typeRef = this._firebaseRef.child('type');
		options = options || {};

		this._enableListener(type, 'child_added', function(snapshot){
			var record = snapshot.val();
			console.log("record added", record);
			_this.subscribeToRecord(type, record.id, options);
		});
	},

	subscribeToRecords: function(type, ids, options){
		var _this = this;
		var promises = map(ids, function(id){
			return _this.subscribeToRecord(type, id, options);
		});

		return Orbit.all(promises);
	},

	subscribeToRecord: function(type, id, options){
		var path = [type, id].join("/");

		return this._addSubscription(path, RecordSubscription, options);
	},

	subscriptions: function(){
		return Object.keys(this._listeners);
	},

	unsubscribeAll: function(){
		var _this = this;
		Object.keys(this._listeners).forEach(function(listenerKey){
			var path = listenerKey.split(":")[0];
			var eventType = listenerKey.split(":")[1];
			var callback = _this._listeners[listenerKey];

			_this._disableListener(path, eventType, callback);
		});
	},

	_subscribeToAttribute: function(type, id, attribute){
		var path = [type, id, attribute].join("/");
		return this._addSubscription(path, AttributeSubscription);
	},

	_subscribeToLink: function(type, id, link, options){
		console.log("subscribing to link", [type, id, link].join("/"));
		console.log("options", options);
		var _this = this;
		var linkType = this._schemaUtils.lookupLinkDef(type, link).type;

		if(linkType === 'hasOne'){
			return this._subscribeToHasOne(type, id, link, options);

		} else if (linkType === 'hasMany'){
			return this._subscribeToHasMany(type, id, link, options);

		} else {
			throw new Error("Unsupported link type: " + linkType);
		}

	},

	_subscribeToHasOne: function(type, id, link, options){
		console.log("subscribing to hasOne", arguments);
		var _this = this;
		var path = [type, id, link].join("/");

		return this._addSubscription(path, HasOneSubscription, options);
	},

	_findSubscription: function(path){
		return this._subscriptions[path];
	},

	_subscribeToHasMany: function(type, id, link, options){
		var _this = this;
		var path = [type, id, link].join("/");

		return this._addSubscription(path, HasManySubscription, options);
	},

	_addSubscription: function(path, SubscriptionClass, subscriptionOptions){
		console.log("_addSubscription", path);
		var subscription = this._findSubscription(path);

		if(subscription){
			var mergedOptions = this._mergeOptions(subscription.options, subscriptionOptions);
			if(!eq(mergedOptions, subscriptionOptions)){
				console.log("subscription:updating", path);
				subscription.options = subscriptionOptions;
				return subscription.update().then(function(){
					console.log("subscription:updated", path);
				});
			}
			else {
				console.log("subscription:duplicate", path);
				return Orbit.resolve();
			}
		}
		else {
			console.log("subscription:activating", path);
			subscription = new SubscriptionClass(path, this);
			subscription.options = subscriptionOptions || buildOptions({});
			console.log("subscription:options", subscription.options);
			this._subscriptions[path] = subscription;
			return subscription.activate().then(function(){
				console.log("subscription:activated", path);
			});
		}
	},

	_mergeOptions: function(current, requested){
		return requested;
	},

	_emitDidTransform: function(operation){
		console.log("emitting", operation.serialize());
		this.emit("didTransform", operation);
	},

	_enableListener: function(path, eventType, callback){
		var _this = this;
		path = (typeof path === 'string') ? path : path.join('/');
		var key = this._buildListenerKey(path, eventType);
		console.log("enabling listener", key);

		if(this._listenerExists(key)) return Orbit.resolve();

		return new Orbit.Promise(function(resolve, reject){
			var wrappedCallback = function(){
				callback.apply(_this, arguments);
				resolve();
			};

			_this._listeners[key] = wrappedCallback;
			_this._firebaseRef.child(path).on(eventType, wrappedCallback);
		});
	},

	_disableListener: function(path, eventType, callback){
		this._firebaseRef.child(path).off(eventType, callback);
	},

	_listenerExists: function(key){
		return this._listeners[key];
	},

	_buildListenerKey: function(path, eventType){
		return [path, eventType].join(":");
	},

	_normalizePath: function(path) {
		return (typeof path === 'string') ? path.split("/") : path;
	}
});
