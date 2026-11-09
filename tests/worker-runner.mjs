import {parentPort,workerData} from 'node:worker_threads';
globalThis.self={postMessage:data=>parentPort.postMessage(data)};
await import(workerData?.entry ?? '../js/routing_worker.js');
parentPort.on('message',data=>self.onmessage({data}));
