//	gossip for mining

import {ethers} from 'ethers'
import Colors from 'colors/safe'
import {logger} from './logger'
import {inspect} from 'node:util'
import {RequestOptions, request } from 'node:http'
import {createMessage, encrypt, enums, readKey, Key} from 'openpgp'
import {getRandomValues} from 'node:crypto'
import {masterSetup} from './util'
import newNodeInfoABI from '../endpoint/newNodeInfoABI.json'



const epochTotal: Map<string, number> = new Map()

/**
 * One logical frame from the node may be raw JSON or SSE (data: ...).
 * Strip SSE field lines so downstream JSON.parse sees only the payload.
 */
const streamFrameToJsonText = (frame: string): string => {
  const block = frame.trim()
  if (!block) return block

  const lines = block.split(/\r?\n/)
  const dataParts: string[] = []
  let sawDataLine = false

  for (const line of lines) {
    if (line.startsWith('data:')) {
      sawDataLine = true
      dataParts.push(line.slice(5).replace(/^\s/, ''))
      continue
    }
    if (line.startsWith(':')) continue
    if (/^(event|id|retry)\s*:/i.test(line)) continue
  }

  if (sawDataLine) return dataParts.join('\n').trim()
  return block
}

/**
 * First SSE frame from SI liveness pool (addIpaddressToLivenessListeningPool):
 * { ipaddress, epoch, status, nodeWallet, hash } — no nodeWallets.
 * Mining pushes (stratlivenessV2) always include nodeWallets.
 */
const isLivenessHandshake = (o: unknown): boolean => {
  if (!o || typeof o !== 'object') return false
  const r = o as Record<string, unknown>
  return typeof r.ipaddress === 'string' && !('nodeWallets' in r)
}

/** Split buffer by SSE/HTTP-style blank line; prefer CRLF then LF. */
const pullNextFrame = (buf: string): { frame: string; rest: string } | null => {
  let idx = buf.indexOf('\r\n\r\n')
  let sep = 4
  if (idx === -1) {
    idx = buf.indexOf('\n\n')
    sep = 2
  }
  if (idx === -1) return null
  return { frame: buf.slice(0, idx), rest: buf.slice(idx + sep) }
}

const startGossip = (
  connectHash: string,
  nodeIndex: number,
  POST: string,
  callback?: (err?: string, data?: string) => void
) => {
  const node = Guardian_Nodes.get(nodeIndex)
  
  // 1. 检查是否正在连接或运行中
  // 注意：我们将 value 设为具体的 request 对象或其他标识，不仅仅是 boolean，方便调试
  if (launchMap.get(connectHash)) {
    // logger(Colors.yellow(`startGossip skipped: ${connectHash} is already active`))
    return
  }
  
  if (!node) {
    return logger(Colors.red(`startGossip Error: Node ${nodeIndex} not found`))
  }

  // 标记为活跃
  launchMap.set(connectHash, true)

  // --- 状态守卫 ---
  // 确保单次执行周期内，relaunch 只会被调用一次
  let isExited = false
  
  // 保存引用的句柄，用于 cleanup
  let req: any = null
  let connectTimer: NodeJS.Timeout | null = null
  let idleTimer: NodeJS.Timeout | null = null

  // 统一清理函数：无论是因为报错、超时还是结束，必须先清理所有资源
  const cleanup = () => {
    if (connectTimer) clearTimeout(connectTimer)
    if (idleTimer) clearTimeout(idleTimer)
    
    // 销毁请求
    if (req && !req.destroyed) {
        req.destroy()
    }
  }

  // 统一重连入口
  const triggerRelaunch = (reason: string) => {
    if (isExited) return
    isExited = true

    // 彻底释放资源
    cleanup()
    
    // 关键：释放 Map 锁，允许下一次 startGossip 进入
    launchMap.set(connectHash, false)

    logger(Colors.yellow(`[Gossip] Relaunching [${node.ip_addr}] reason: ${reason}`))
    
    setTimeout(() => {
      startGossip(connectHash, nodeIndex, POST, callback)
    }, 1000)
  }

  // --- 设置连接超时 (5s) ---
  connectTimer = setTimeout(() => {
    triggerRelaunch("Connect Timeout (5s)")
  }, 5000)

  const option: RequestOptions = {
    host: node.ip_addr,
    port: 80,
    method: 'POST',
    protocol: 'http:', // 确认是否需要 https
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'Connection': 'keep-alive' // 显式声明
    },
    path: "/post",
  }

  // --- 发起请求 ---
  req = request(option, res => {
    // 连接成功建立，清除连接超时
    if (connectTimer) clearTimeout(connectTimer)
    connectTimer = null

    // 注意：这里不要把 launchMap 设为 false！连接还在运行中！
    
    if (res.statusCode !== 200) {
      triggerRelaunch(`Bad Status Code: ${res.statusCode}`)
      return
    }

    let buffer = ''
    let first = true

    // 心跳看门狗：如果 24秒内没有收到任何数据，认为死链
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        triggerRelaunch("Idle Timeout (24s No Data)")
      }, 24 * 1000)
    }

    // 初始启动心跳
    resetIdleTimer()

    res.on('data', chunk => {
      // 收到数据，重置心跳
      resetIdleTimer()
      
      buffer += chunk.toString()

      let pulled: { frame: string; rest: string } | null
      while ((pulled = pullNextFrame(buffer))) {
        buffer = pulled.rest
        const part = pulled.frame

        if (!part.trim()) continue

        const jsonText = streamFrameToJsonText(part)
        if (!jsonText) continue

        if (first) {
          try {
            const parsed = JSON.parse(jsonText) as unknown
            first = false
            if (isLivenessHandshake(parsed)) {
              continue
            }
            callback?.('', jsonText)
          } catch (ex) {
            logger(Colors.red(`JSON Parse Error (First liveness / SSE)`), ex)
          }
          continue
        }

        callback?.('', jsonText)
      }
    })

    res.once('end', () => {
      triggerRelaunch("Stream Ended (Server Closed)")
    })

    res.once('error', (err) => {
      triggerRelaunch(`Response Error: ${err.message}`)
    })
  })

  // --- 请求级错误处理 ---
  req.on('error', (err: any) => {
    // 这里的 error 可能和 res.on('error') 重复，isExited 会拦截多余调用
    triggerRelaunch(`Request Error: ${err.message}`)
  })

  // 写入数据
  req.end(POST)
}

let wallet: ethers.HDNodeWallet

const postLocalhost = (path: string, obj: any)=> new Promise(async resolve =>{
	
	const option: RequestOptions = {
		hostname: 'localhost',
		path,
		port: 8004,
		method: 'POST',
		protocol: 'http:',
		headers: {
			'Content-Type': 'application/json'
		}
	}
	
	const req = await request (option, res => {
		if (res.statusCode !== 200) {
			logger(Colors.red(`postLocalhost http://localhost/${path} Error!!!`))
			return resolve(false)
		}
		resolve(true)
		return //logger(Colors.grey(`postLocalhost http://localhost/${path} Success!!!`),inspect(obj, false, 3, true))

	})

	req.once('error', (e) => {
		console.error(`postLocalhost to master on Error! ${e.message}`)

	})

	req.write(JSON.stringify(obj))
	req.end()
})

let sendCount = 0
let epoch = 0
let  PassportPoolProcessCount = 0


const launchMap: Map<string, boolean> = new Map()
const activeRequests: Map<string, ReturnType<typeof request>> = new Map()


const activeNodeSessions = new Map<number, boolean>()


const connectToGossipNode = async (nodeIndex: number) => {
    // 🛡️ 守卫：如果该节点已经在处理中，直接返回
    if (activeNodeSessions.get(nodeIndex)) {
        // 可选：打印日志调试
        // logger(Colors.yellow(`connectToGossipNode: Node ${nodeIndex} is already active/connecting. Skipping.`))
        return
    }

    const node = Guardian_Nodes.get(nodeIndex)
    if (!node) {
        return logger(Colors.red(`connectToGossipNode Error! nodeIndex ${nodeIndex} not found!`))
    }

    // 🔒 上锁：标记该节点为活跃状态
    activeNodeSessions.set(nodeIndex, true)

    logger(Colors.green(`connectToGossipNode ${node.domain} ${node.ip_addr} ${node.nftNumber} start...`))

    const walletAddress = wallet.address.toLowerCase()
    const key = Buffer.from(getRandomValues(new Uint8Array(16))).toString('base64')
    
    // ... 原有的加密准备逻辑 ...
    const command = {
        command: 'mining',
        walletAddress,
        algorithm: 'aes-256-cbc',
        Securitykey: key,
    }
    
    const message = JSON.stringify(command)
    const signMessage = await wallet.signMessage(message)
    
    if (!node.armoredPublicKey) {
        activeNodeSessions.delete(nodeIndex) // ❌ 失败回滚：释放锁
        logger(inspect(node, false, 3, true))
        return logger(Colors.red(`connectToGossipNode Error! nodeIndex ${nodeIndex} armoredPublicKey is null!`))
    }

    let encryptObj
    try {
        encryptObj = {
            message: await createMessage({text: Buffer.from(JSON.stringify ({message, signMessage})).toString('base64')}),
            encryptionKeys: await readKey({armoredKey: node.armoredPublicKey}),
            config: { preferredCompressionAlgorithm: enums.compression.zlib }
        }
    } catch (ex) {
        activeNodeSessions.delete(nodeIndex) // ❌ 失败回滚：释放锁
        logger(inspect(node, false, 3, true))
        logger(Colors.red(`connectToGossipNode ${node.ip_addr} createMessage Error!`), ex)
        return
    }

    let postData
    try {
        postData = await encrypt(encryptObj)
    } catch (ex) {
        activeNodeSessions.delete(nodeIndex) // ❌ 失败回滚
        logger(Colors.red(`connectToGossipNode ${node.ip_addr} encrypt Error!`), ex)
        return
    }

    logger(Colors.blue(`connectToGossipNode ${node.domain}:${node.ip_addr}`))
    
    // ⚠️ 注意：这里的 postData 包含了当前的时间戳签名。
    // 如果 startGossip 内部在 1 小时后因为网络波动重试，它依然发送这个旧的 postData。
    // 如果服务器校验时间戳（防重放攻击），重试会一直失败（401/403）。
    // 理想情况下，startGossip 应该接受一个能够 "重新生成 postData" 的回调函数，而不是死数据。
    
    startGossip(
        node.ip_addr + walletAddress, 
        node.nftNumber, 
        JSON.stringify({data: postData}), 
        async (err, _data) => {
            // 如果 startGossip 报出了致命错误（不再重试），则需要在这里 delete(nodeIndex)
            // 但如果 startGossip 只是通知数据，或者内部自动重试，则不要 delete
            
            if (err) {
                 // 假设 err 字符串包含某些致命关键词时才释放锁
                 // activeNodeSessions.delete(nodeIndex)
                 logger(Colors.red(`Gossip Error [${node.ip_addr}]: ${err}`))
                 return
            }

            if (!_data) {
                return logger(Colors.magenta(`connectToGossipNode ${node.ip_addr} push ${_data} is null!`))
            }

		try {
			const data: listenClient = JSON.parse(_data)
			
			const wallets = data.nodeWallets||[]
			const users = data.userWallets||[]
			node.lastEposh =  data.epoch

			const messageVa = {epoch: data.epoch.toString(), wallet: walletAddress}
			const nodeWallet = ethers.verifyMessage(JSON.stringify(messageVa), data.hash).toLowerCase()

			if (nodeWallet !== data.nodeWallet.toLowerCase()) {
				return logger(Colors.red(`${node.ip_addr} validatorMining verifyMessage hash Error! nodeWallet ${nodeWallet} !== validatorData.nodeWallet.toLowerCase() ${data.nodeWallet.toLowerCase()}`))
			}

			let total = epochTotal.get (data.epoch.toString())||0

			if (!total) {
				logger(`******************************************* didResponseNode Total send to local ${sendCount}`, inspect(didResponseNode, false, 3, true), '*******************************************')
				didResponseNode = JSON.parse(JSON.stringify(allNodeAddr))
			}

			const index = didResponseNode.findIndex(n => n === node.ip_addr)
			if (index >= 0) {
				didResponseNode.splice(index, 1)
			}
			epochTotal.set(data.epoch.toString(), total +1 )
			if (epoch != data.epoch) {
				epoch = data.epoch
				sendCount = 0
			}

        
            
            const transfer = data?.transfer

			sendCount ++
			let kk = null
			if (postLocal) {
				kk = await postLocalhost('/api/miningData', {wallets, users, ipaddress: node.ip_addr, epoch: data.epoch, nodeWallet: nodeWallet, transfer})
			}


			logger(Colors.grey(`PassportPoolProcessCount = [${PassportPoolProcessCount}] startGossip got EPOCH ${data.epoch} [${node.ip_addr}:${data.nodeWallet}] Total nodes ${total +1} miners ${data.nodeWallets.length} users ${data.userWallets.length} ${kk ? ' sendLocalhost count ' + sendCount + 'SUCCESS' : ''}`))
		} catch (ex) {
			logger(Colors.blue(`${node.ip_addr} => \n${_data}`))
			logger(Colors.red(`connectToGossipNode ${node.ip_addr} JSON.parse(_data) Error!`))
		}
	})

}

let kkk: ReturnType<typeof request> | null = null as any




let didResponseNode: string[] = []


const rateAddr = '0x467c9F646Da6669C909C72014C20d85fc0A9636A'.toLowerCase()
const filePath = '/home/peter/.data/v2/'



const listenPool: Map<number, Map<string, string[]>> = new Map()
const userPool: Map<number, Map<string, string[]>> = new Map()

let currentEpoch = 0
const CONET_MAINNET = new ethers.JsonRpcProvider('https://publicrpc.conet.network') 
let getAllNodesProcess = false
let Guardian_Nodes: Map<number, nodeInfo> = new Map()
/** 与 `deployments/conet-addresses.json` / GuardianNodesInfoV6 主网部署保持一致（由 updateConetReferences.ts 同步） */
const GuardianNodeInfo_mainnet = '0xBC6b53065b5647261396d002bDBA0d3396E0722f'
const GuardianNodesMainnet = new ethers.Contract(GuardianNodeInfo_mainnet, newNodeInfoABI, CONET_MAINNET)


/** 不向外抛错，避免 systemd 子进程因未处理 rejection 直接退出。 */
const getAllNodes = async (): Promise<void> => {
	try {
		const _nodes1 = await GuardianNodesMainnet.getAllNodes(0, 400)
		const _nodes2 = await GuardianNodesMainnet.getAllNodes(400, 800)
		const _nodes = [..._nodes1, ..._nodes2]

		for (let i = 0; i < _nodes.length; i ++) {
			const node = _nodes[i]
			const id = parseInt(node[0].toString())
			const pgpString: string = Buffer.from( node[1], 'base64').toString()
			const domain: string = node[2]
			const ipAddr: string = node[3]
			const region: string = node[4]
			
			logger(i)

			const itemNode: nodeInfo = {
				ip_addr: ipAddr,
				armoredPublicKey: pgpString,
				domain: domain,
				nftNumber: id,
				region: region
			}
		
			Guardian_Nodes.set(id, itemNode)
		}
		logger(Colors.red(`getAllNodes done Guardian_Nodes = ${Guardian_Nodes.size} `))
	} catch (e: any) {
		if (e?.code === 'BAD_DATA' && /value="0x"/.test(e?.message ?? '')) {
			logger(Colors.yellow(`getAllNodes: contract returned empty (0x), treat as no nodes (check GuardianNodesInfoV6 address / RPC)`))
		} else {
			logger(Colors.red(`getAllNodes Error: ${e?.message ?? e}`))
		}
	}
}

let allNodeAddr: string[] = []
const startGossipListening = () => {
	if (!Guardian_Nodes.size) {
		return logger(Colors.red(`startGossipListening Error! gossipNodes is null!`))
	}

	logger(Colors.blue(`startGossipListening gossipNodes = ${Guardian_Nodes.size}`))
	
	Guardian_Nodes.forEach((n, key) => {
		allNodeAddr.push (n.ip_addr)
		connectToGossipNode(key)
	})

    // const node = Guardian_Nodes.get(600)
    // if (node) {
    //     allNodeAddr.push (node.ip_addr)
    //     connectToGossipNode(600)
    // }


	
}

const checkNodeUpdate = async(block: number) => {
	const blockTs = await CONET_MAINNET.getBlock(block)
	
	if (!blockTs?.transactions) {
		return 
	}


	for (let tx of blockTs.transactions) {

		const event = await CONET_MAINNET.getTransactionReceipt(tx)
		if ( event?.to?.toLowerCase() === GuardianNodeInfo_mainnet.toLowerCase()) {
			void getAllNodes().catch((err: unknown) =>
				logger(Colors.red(`getAllNodes (block ${block}): ${err instanceof Error ? err.message : String(err)}`))
			)
		}
		
	}
}
const startEPOCH_EventListeningForMining = async () => {

	CONET_MAINNET.on('block', block => {

		checkNodeUpdate(block)

	})
}

const start = async () => {
	try {
		logger(Colors.blue(`Layer Minus listenning V2 start from (${_start}) to (${_end})`))
		wallet = ethers.Wallet.createRandom()
		await getAllNodes()
		startGossipListening()
		managerWallet = Math.round(_start / 100)

		const _wa = new ethers.Wallet(masterSetup.LayerMinus[managerWallet], CONET_MAINNET)

		startEPOCH_EventListeningForMining()
	} catch (e: unknown) {
		logger(Colors.red(`Layer Minus V2 start failed: ${e instanceof Error ? e.message : String(e)}`))
	}
}


const [,,...args] = process.argv
let _start = 0
let _end = 1
let postLocal = true
let managerWallet = 0
args.forEach ((n, index ) => {
	if (/^N\=/i.test(n)) {
		_end = parseInt(n.split('=')[1])
	}

	if (/^P/i.test(n)) {
		postLocal = false
	}

	if (/^S\=/i.test(n)) {
		_start = parseInt(n.split('=')[1])
	}
})

if (_end - _start > 0) {
	start()
}