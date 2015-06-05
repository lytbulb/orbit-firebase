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
import { deepMerge } from 'orbit-firebase/lib/object-utils';


export default Class.extend({
	init: function(firebaseRef, schema, serializer){
		Evented.extend(this);

		this._firebaseRef = firebaseRef;
		this._firebaseClient = new FirebaseClient(this._firebaseRef);
		this._schema = schema;
		this._schemaUtils = new SchemaUtils(schema);
		this._serializer = serializer;

		this._listeners = {};
		this._listenerInitializers = {};
		this._subscriptions = {};
	},

	subscribeToType: function(type, _, subscriptionOptions){
		var _this = this;
		var typeRef = this._firebaseRef.child('type');
		subscriptionOptions = buildOptions(subscriptionOptions);

		this._enableListener(type, 'child_added', function(snapshot){
			var record = snapshot.val();
			_this.subscribeToRecord(type, record.id, subscriptionOptions);
		});
	},

	subscribeToRecords: function(type, ids, options){
		var _this = this;
		var promises = map(ids, function(id){
			return _this.subscribeToRecord(type, id, options);
		});

		return this._settleAllPermitted(promises);
	},

	_settleAllPermitted: function(promises){
		return new Orbit.Promise(function(resolve, reject){
			return Orbit.allSettled(promises).then(function(settled){
				var values = [];

				settled.forEach(function(promiseResult){
					if(promiseResult.state === 'rejected'){
						if(promiseResult.reason.code === 'PERMISSION_DENIED'){
							// filter out values that have access denied
						}
						else {
							throw new Error(promiseResult.reason);
						}
					}
					else if(promiseResult.state === 'fulfilled'){
						values.push(promiseResult.value);
					}
				});
				resolve(values);
			});
		});
	},

	subscribeToRecord: function(type, id, subscriptionOptions){
		var path = [type, id].join("/");
		subscriptionOptions = buildOptions(subscriptionOptions);

		return this._addSubscription(path, RecordSubscription, subscriptionOptions);
	},

	subscriptions: function(){
		return Object.keys(this._subscriptions);
	},

	hasActiveSubscription: function(subscriptionPath){
		var subscription = this._subscriptions[subscriptionPath];
		return subscription && subscription.status === 'active';
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

	subscribeToLink: function(type, id, link, options){
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
		var _this = this;
		var path = [type, id, link].join("/");

		return this._addSubscription(path, HasOneSubscription, options);
	},

	findSubscription: function(path){
		return this._subscriptions[path];
	},

	_subscribeToHasMany: function(type, id, link, options){
		var _this = this;
		var path = [type, id, link].join("/");

		return this._addSubscription(path, HasManySubscription, options);
	},

	_addSubscription: function(path, SubscriptionClass, subscriptionOptions){
		subscriptionOptions = buildOptions(subscriptionOptions);
		var _this = this;
		var subscription = this.findSubscription(path);

		if(!subscription) {
			subscription = this._createSubscription(SubscriptionClass, path);
			this._subscriptions[path] = subscription;
		}

		if(subscription.status === 'active'){
			return this._updateSubscription(subscription, subscriptionOptions);
		}
		else {
			return this._activateSubscription(subscription, subscriptionOptions);
		}
	},

	_createSubscription: function(SubscriptionClass, path, options){
		var subscription = new SubscriptionClass(path, this);
		subscription.status = "new";
		return subscription;
	},

	_activateSubscription: function(subscription, options){
		subscription.options = options;
		return subscription.activate().then(
			function(result){
				subscription.status = "active";
				return result;

			}, function(error){
				subscription.status = error.code === "PERMISSION_DENIED" ? "permission_denied" : "error";

				if(subscription.status !== "permission_denied"){
					throw error;
				}
			});
	},

	_updateSubscription: function(subscription, options){
		var mergedOptions = this._mergeOptions(subscription.options, options);
		if(!eq(mergedOptions, subscription.options)){
			subscription.options = options;
			return subscription.update();
		}
		else {
			return Orbit.resolve();
		}
	},

	_mergeOptions: function(current, requested){
		return deepMerge(current, requested);
	},

	_emitDidTransform: function(operation){
		this.emit("didTransform", operation);
	},

	_enableListener: function(path, eventType, callback){
		var _this = this;
		path = (typeof path === 'string') ? path : path.join('/');
		var key = this._buildListenerKey(path, eventType);

		if(!this._listenerInitializers[key]){
			this._listenerInitializers[key] = new Orbit.Promise(function(resolve, reject){
				var wrappedCallback = function(){
					var result = callback.apply(_this, arguments);
					resolve(result);
				};

				_this._listeners[key] = wrappedCallback;
				_this._firebaseRef.child(path).on(eventType, wrappedCallback, function(error){
					delete _this._listeners[key];
					reject(error);
				});
			});
		}

		return this._listenerInitializers[key];
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
