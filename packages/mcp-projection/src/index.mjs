export async function invokeMcp(service, method, params) {
  switch (method) {
    case 'mgds.doctor': return service.doctor();
    case 'mgds.discover': return service.discover();
    case 'mgds.run-task': return service.runTask(params.task);
    case 'mgds.cancel': return service.cancel(params.jobId);
    case 'mgds.collect': return service.collect(params.runId);
    case 'mgds.report': return service.report(params.runId);
    default: throw new Error(`MGDS_UNSUPPORTED_METHOD:${method}`);
  }
}
