/* eslint-disable max-lines-per-function */
import { it, describe, expect, vi } from 'vitest';
import { DumpSubscriber, ExecutionTaskActionApply, ExecutionTaskInsightFind, ExecutionTaskInsightFindApply, InsightDump } from '@/index';
import { Executor } from '@/action/executor';
import { fakeInsight } from 'tests/utils';
import { join } from 'path';
import { getDumpDir } from '@/utils';
import { existsSync, readFileSync } from 'fs';

const insightFindTask = (shouldThrow?: boolean) => {
  let insightDump: InsightDump | undefined;
  const dumpCollector: DumpSubscriber = (dump) => {
    insightDump = dump;
  };
  const insight = fakeInsight('test-executor');
  insight.onceDumpUpdatedFn = dumpCollector;

  const insightFindTask: ExecutionTaskInsightFindApply = {
    type: 'Insight',
    subType: 'find',
    param: {
      query: 'test',
    },
    async executor(param) {
      if (shouldThrow) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        throw new Error('test-error');
      }
      return {
        output: {
          element: await insight.find(param.query),
        }, 
        log: {
          dump: insightDump,
        },
      };
    },
  };
  return insightFindTask;
}

// const insightExtractTask = () => {
//   let insightDump: InsightDump | undefined;
//   const dumpCollector: DumpSubscriber = (dump) => {
//     insightDump = dump;
//   };
//   const insight = fakeInsight('test-executor');
//   insight.onceDumpUpdatedFn = dumpCollector;
  
//   const task: any = {
//     type: 'Insight-extract',
//     param: {
//       dataDemand: 'data-demand',
//     },
//     async executor(param: any) {
//       return {
//         output: {
//           data: await insight.extract(param.dataDemand as any),
//         },
//         log: {
//           dump: insightDump,
//         },
//       };
//     },
//   };
//   return task;
// }

describe('executor', () => {
  it('insight - basic run', async () => {
    const insightTask1 = insightFindTask();

    const taskParam = {
      action: 'tap',
      anything: 'acceptable',
    };
    const tapperFn = vi.fn();
    const actionTask: ExecutionTaskActionApply = {
      type: 'Action',
      param: taskParam,
      executor: tapperFn,
    };

    const inputTasks = [insightTask1, actionTask];

    const executor = new Executor('test', 'hello, this is a test',inputTasks);
    await executor.flush();
    const tasks = executor.tasks as ExecutionTaskInsightFind[];
    const {element} = tasks[0].output!;
    expect(element).toBeTruthy();
    
    expect(tasks.length).toBe(inputTasks.length);
    expect(tasks[0].status).toBe('success');
    expect(tasks[0].output).toMatchSnapshot();
    expect(tasks[0].log!.dump).toBeTruthy();
    expect(tasks[0].timing?.end).toBeTruthy();
    
    expect(tapperFn).toBeCalledTimes(1);
    expect(tapperFn.mock.calls[0][0]).toBe(taskParam);
    expect(tapperFn.mock.calls[0][1].element).toBe(element);
    expect(tapperFn.mock.calls[0][1].task).toBeTruthy();

    const dump = executor.dump();
    expect(dump.logTime).toBeTruthy();

  }, {
    timeout: 999 * 1000,
  });

  it('insight - init and append', async () => {
    const initExecutor = new Executor('test');
    expect(initExecutor.status).toBe('init');
    const tapperFn = vi.fn();

    const insightTask1 = insightFindTask();
    const actionTask: ExecutionTaskActionApply = {
      type: 'Action',
      param: {
        action: 'tap',
        element: 'previous',
      },
      executor: async () => {
        // delay 500
        await new Promise((resolve) => setTimeout(resolve, 500));
        tapperFn();
      },
    };

    initExecutor.append(insightTask1);
    initExecutor.append(actionTask);
    expect(initExecutor.status).toBe('pending');
    expect(initExecutor.tasks.length).toBe(2);
    expect(tapperFn).toBeCalledTimes(0);


    const dumpContent1 = initExecutor.dump();
    expect(dumpContent1.tasks.length).toBe(2);

    // append while running
    await Promise.all([
      initExecutor.flush(),
      (async () => {
        // sleep 200ms
        expect(initExecutor.status).toBe('running');
        await new Promise((resolve) => setTimeout(resolve, 200));
        initExecutor.append(actionTask);
        expect(initExecutor.status).toBe('running');
      })(),
    ]);
  
    expect(initExecutor.status).toBe('completed');
    expect(initExecutor.tasks.length).toBe(3);
    expect(initExecutor.tasks[2].status).toBe('success');

    // append while completed
    initExecutor.append(actionTask);
    expect(initExecutor.status).toBe('pending');

    // same dumpPath to append
    const dumpContent2 = initExecutor.dump();
    expect(dumpContent2.tasks.length).toBe(4);
  });

  // it('insight - run with error', async () => {
  //   const executor = new Executor('test', 'test-description',[insightFindTask(true), insightFindTask()]);
  //   const r = await executor.flush();
  //   const tasks = executor.tasks as ExecutionTaskInsightFind[];

  //   expect(tasks.length).toBe(2);
  //   expect(tasks[0].status).toBe('fail');
  //   expect(tasks[0].error).toBeTruthy();
  //   expect(tasks[0].timing!.end).toBeTruthy();
  //   expect(tasks[1].status).toBe('cancelled');
  //   expect(executor.status).toBe('error');
  //   expect(r).toBeFalsy();
    
  //   // expect to throw an error
  //   expect(async () => {
  //     await executor.flush();
  //   }).rejects.toThrowError();

  //   expect(async () => {
  //     await executor.append(insightExtractTask());
  //   }).rejects.toThrowError();
  // }, {
  //   timeout: 9999999,
  // });
});
