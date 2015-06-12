import { Class } from 'orbit/lib/objects';
import Orbit from 'orbit/main';

export default Class.extend({
	init: function(cache){
		this._cache = cache;
	},

	handles: function(operation){
		return operation.path[2].match(/^__/);
	},

	transform: function(operation){
		this._cache.transform(operation);
		return Orbit.resolve();
	}
});
