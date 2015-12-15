var cluster = require('cluster');

var job = (process.argv[2] == undefined || process.argv[2] == 'scrape') ? 'scrape' : 'archive';

function startWorker() {
		var worker = cluster.fork();
		console.log('SERVER-CLUSTER_OPERATION: Starting worker %d of 1.', worker.id);
}

if(cluster.isMaster){

		// we're only running one worker at a time		
		[0].forEach(function(){
			startWorker();
		});

		// log any workers that disconnect; if a worker disconnects, it
		// should then exit, so we'll wait for the exit event to spawn
		// a new worker to replace it
		cluster.on('disconnect', function(worker){
				console.log('SERVER-CLUSTER_OPERATION: Worker %d disconnected from the cluster.',
						worker.id);
		});

		// when a worker dies (exits), create a worker to replace it
		cluster.on('exit', function(worker, code, signal){
				console.log('SERVER-CLUSTER_OPERATION: Worker %d died with exit code %d (%s)',
						worker.id, code, signal);

				// only start a new worked if in scrape mode
				if (job == 'scrape') {
					startWorker();
				}
		});

} else {

		// start our app on worker; see server.js
		require('./server.js')();

}