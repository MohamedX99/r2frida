'use strict';

const commandHandlers = {
  'env': dumpEnv,
  'i': dumpInfo,
  'il': dumpModules,
  'dpt': dumpThreads,
  'dm': dumpMemory,
};

function dumpEnv(args) {
  const kv = args.join('');
  const eq = kv.indexOf('=');
  if (eq !== -1) {
    const k = kv.substring(0, eq);
    const v = kv.substring(eq + 1);
    setEnv(k, v, true);
    return true;
  } else {
    return {
      key: kv,
      value: getEnv(kv)
    };
  }
}

const getPid = new NativeFunction(Module.findExportByName(null, 'getpid'), 'int', []);

const getEnvImpl = new NativeFunction(Module.findExportByName(null, 'getenv'), 'pointer', ['pointer']);
const setEnvImpl = new NativeFunction(Module.findExportByName(null, 'setenv'), 'int', ['pointer', 'pointer', 'int']);

function getEnv(name) {
  return Memory.readUtf8String(getEnvImpl(Memory.allocUtf8String(name)));
}

function setEnv(name, value, overwrite) {
  return setEnvImpl(Memory.allocUtf8String(name), Memory.allocUtf8String(value), overwrite ? 1 : 0);
}

function dumpInfo() {
  return {
    arch: Process.arch,
    bits: Process.pointerSize * 8,
    os: Process.platform,
    pid: getPid(),
    objc: ObjC.available,
    dalvik: Dalvik.available,
  };
}

function dumpModules() {
  return Process.enumerateModulesSync();
}

function dumpThreads() {
  return Process.enumerateThreadsSync();
}

function dumpMemory() {
  return Process.enumerateRangesSync('---');
}

const requestHandlers = {
  read: read,
  perform: perform,
};

function read(params) {
  const {offset, count} = params;

  const bytes = Memory.readByteArray(ptr(offset), count);

  return [{}, bytes];
}

function perform(params) {
  const {command, blocksize} = params;

  const tokens = command.split(/ /);
  const [name, ...args] = tokens;

  const handler = commandHandlers[name];
  if (handler === undefined)
    throw new Error('Unhandled command: ' + name);

  const value = handler(args, blocksize);

  return [{
    value: JSON.stringify(value)
  }, null];
}

function onStanza(stanza) {
  const handler = requestHandlers[stanza.type];
  if (handler !== undefined) {
    try {
      const [replyStanza, replyBytes] = handler(stanza.payload);
      send(replyStanza, replyBytes);
    } catch (e) {
      send({
        error: e.message
      });
    }
  } else {
    console.error('Unhandled stanza: ' + stanza.type);
  }

  recv(onStanza);
}
recv(onStanza);
