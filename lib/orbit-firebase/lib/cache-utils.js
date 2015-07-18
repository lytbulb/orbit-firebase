import { Class } from 'orbit/lib/objects';
import OperationEncoder from 'orbit-common/operation-encoder';
import { eq } from 'orbit/lib/eq';

export default Class.extend({
	init: function(cache){
		this.cache = cache;
		this._operationEncoder = new OperationEncoder(cache.schema);
	},

	retrieveLink: function(type, id, link) {
		var val = this.cache.retrieve([type, id, '__rel', link]);
		if (val !== null && typeof val === 'object') {
			val = Object.keys(val);
		}
		return val;
	},

	isRedundent: function(operation){
		var operationType = this._operationEncoder.identify(operation);
		
		if(operationType === 'addRecord'){
			return !!this.cache.retrieve(operation.path);
		}

		if(operation.op === 'add'){
			return eq(this.cache.retrieve(operation.path), operation.value);
		}

		if(operation.op === 'remove'){
			return !this.cache.retrieve(operation.path);
		}

		return false;
	}
});
