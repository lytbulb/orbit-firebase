import { Class } from 'orbit/lib/objects';
import Orbit from 'orbit/main';
import { removeAt } from 'orbit-firebase/lib/array-utils';

export default Class.extend({
	init: function(firebaseRef){
		this.firebaseRef = firebaseRef;
	},

	authenticateAdmin: function(secret){
		return this._authenticate(secret);
	},

	authenticateUser: function(secret, userDetails){
		var tokenGenerator = new FirebaseTokenGenerator("qhZ7kS15BjTXbwGLkXtqxGP6HLxDTzUDlEivT70M");
    var userToken = tokenGenerator.createToken(userDetails);
    return this._authenticate(userToken);
	},

	_authenticate: function(token){
		var _this = this;
		return new Orbit.Promise(function(resolve, reject){
			_this.firebaseRef.authWithCustomToken(token, function(error){
				if(error){
					reject(error);
				}
				else {
					resolve();
				}
			});
		});
	},

	set: function(path, value){
		path = this._normalizePath(path);

		var _this = this;
		return new Orbit.Promise(function(resolve, reject){
			value = value || null; // undefined causes error in firebase client
			_this.firebaseRef.child(path).set(value, function(error){
				error ? reject(error) : resolve(value); // jshint ignore:line
			});
		});

	},

	push: function(path, value){
		var _this = this;
		return new Promise(function(resolve, reject){
			_this.firebaseRef.child(path).push(value, function(error){
				if(error) {
					reject(error);
				}
				else {
					resolve();
				}
			});
		});
	},

	remove: function(path){
		var _this = this;
		path = this._normalizePath(path);

		return new Orbit.Promise(function(resolve, reject){
			_this.firebaseRef.child(path).remove(function(error){
				error ? reject(error) : resolve(); // jshint ignore:line
			});
		});
	},

	valueAt: function(path){
		var _this = this;
		path = this._normalizePath(path);

		return new Orbit.Promise(function(resolve, reject){
			_this.firebaseRef.child(path).once('value', function(snapshot){

				resolve(snapshot.val());

			}, function(error){
				reject(error);
			});
		});
	},

	removeFromArray: function(arrayPath, value){
		var _this = this;

		return this.valueAt(arrayPath).then(function(array){
			if(!array) return;
			console.log(array);

			var index = array.indexOf(value);
			if(index === -1) return Orbit.resolve();

			array.splice(index, 1);
			return _this.set(arrayPath, array);
		});
	},

	removeFromArrayAt: function(arrayPath, index){
		var _this = this;
		arrayPath = this._normalizePath(arrayPath);

		return this.valueAt(arrayPath).then(function(array){
			if(!array) return;

			array = removeAt(array, index);
			return _this.set(arrayPath, array);
		});
	},

	appendToArray: function(arrayPath, value){
		var _this = this;
		arrayPath = this._normalizePath(arrayPath);

		return _this.valueAt(arrayPath).then(function(array){
			array = array || [];
			if(array.indexOf(value) === -1){
				array.push(value);
			}
			return _this.set(arrayPath, array);

		});
	},

    _normalizePath: function(path) {
    	return (typeof path === 'string') ? path : path.join('/');
    },
});

