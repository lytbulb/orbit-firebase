import Orbit from 'orbit/main';
import OC from 'orbit-common/main';
import { Class } from 'orbit/lib/objects';
import SchemaUtils from 'orbit-firebase/lib/schema-utils';
import { removeItem } from 'orbit-firebase/lib/array-utils';

export default Class.extend({
	init: function(firebaseClient, schema){
		this._firebaseClient = firebaseClient;
		this._schemaUtils = new SchemaUtils(schema);
	},

	handles: function(operation){
		var path = operation.path;
		if(path[2] !== '__rel') return;
		var linkType = this._schemaUtils.lookupLinkDef(path[0], path[3]).type;
		return ["add", "replace"].indexOf(operation.op) !== -1 && path[2] === '__rel' && linkType === 'hasOne';
	},

	transform: function(operation){
		if(operation.value === OC.LINK_NOT_INITIALIZED) return Orbit.resolve();

		var path = removeItem(operation.path, '__rel');
		return this._firebaseClient.set(path, operation.value);
	}
});
