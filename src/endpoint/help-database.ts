
import type { TLSSocketOptions } from 'node:tls'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { homedir, platform } from 'node:os'
import { logger, getIpaddressLocaltion, regiestCloudFlare, sendCONET, getCONETConfirmations, conet_Holesky_rpc, transferCCNTP, checkSignObj, checkClaimeToeknbalance, getServerIPV4Address} from '../util/util'
import { createHash } from 'node:crypto'
import type {RequestOptions, } from 'node:http'
import {v4} from 'uuid'
import {encryptWithPublicKey, createIdentity, hash, decryptWithPrivateKey, recover } from 'eth-crypto'
import type { GenerateKeyOptions, Key, PrivateKey, Message, MaybeStream, Data, DecryptMessageResult, WebStream, NodeStream } from 'openpgp'
import type {Response, Request } from 'express'
import Color from 'colors/safe'
import {Wallet, ethers} from 'ethers'
import { Client, auth, types } from 'cassandra-driver'
import type {ClientOptions} from 'cassandra-driver'
import moment from 'moment'
const setup = join( homedir(),'.master.json' )
import {request as HttpRequest } from 'node:http'
import {sign} from 'eth-crypto'
import { address, isPublic, isV4Format, isV6Format} from 'ip'
import { mapLimit } from 'async'

const masterSetup: ICoNET_DL_masterSetup = require ( setup )


const FaucetTTL = 60 * 60 * 24

const developIP = ['38.102.87.58','207.90.195.68']
const checkDevelopIP = (ipaddress: string) => {
	const index = developIP.findIndex(v => v === ipaddress)
	return index <0 ? false: true
}
const wei = 1000000000000000000
const si_last_Update_time_timeout = 1000 * 60 *5
const CoNETCashFee = 0.0001
const CoNET_SI_healthy_TTL = 1 * 60 * 5
const streamCoNET_USDCInterval = 3 * 60 * 1000
const asset_name = 'USDC'

const sslOptions: TLSSocketOptions = {
	key : masterSetup.Cassandra.certificate.key,
	cert : masterSetup.Cassandra.certificate.cert,
	ca : masterSetup.Cassandra.certificate.ca,
	rejectUnauthorized: masterSetup.Cassandra.certificate.rejectUnauthorized
}

const option: ClientOptions = {
	contactPoints : masterSetup.Cassandra.databaseEndPoints,
	localDataCenter: 'dc1',
	authProvider: new auth.PlainTextAuthProvider ( masterSetup.Cassandra.auth.username, masterSetup.Cassandra.auth.password ),
	sslOptions: sslOptions,
	keyspace: masterSetup.Cassandra.keyspace,
	protocolOptions: { maxVersion: types.protocolVersion.v4, maxSchemaAgreementWaitSeconds: 360 },
	prepareOnAllHosts: true,
	pooling: {maxRequestsPerConnection: 128}
}

const checkPayloadWalletSign = (payload: ICoNET_DL_POST_register_SI) => {

	let signAddr = ''
	let _txObjHash = ''

	try {
		_txObjHash = hash.keccak256(payload.walletAddr)
		signAddr = recover( payload.walletAddrSign , _txObjHash).toUpperCase()
	} catch (ex) {
		logger (Color.red(`checkPayloadWalletSign recover Error`), ex)
		return false
	}
	payload.walletAddr = payload.walletAddr.toUpperCase()

	if (signAddr !== payload.walletAddr) {
		logger (Color.red(`checkPayloadWalletSign signAddr[${signAddr}] !== payload.walletAddr [${payload.walletAddr}] Error`))
		return false
	}

	return true
}

export const CoNET_SI_Register = ( payload: ICoNET_DL_POST_register_SI ) => {
	return new Promise ( async resolve=> {

		if (!checkPayloadWalletSign(payload)) {
			return resolve(false)
		}
	
		const nft_tokenid = createHash('sha256').update(payload.walletAddr.toLowerCase()).digest('hex')
		//logger(Color.blue(`nft_tokenid[${nft_tokenid}] = createHash('sha256').update(payload.walletAddr.toLowerCase())[${payload.walletAddr.toLowerCase()}]`))
		payload.nft_tokenid = nft_tokenid
		
		const customs_review_total = (Math.random()*5).toFixed(2)
	
		const cmd0 = `SELECT * from conet_si_nodes WHERE nft_tokenid = '${ nft_tokenid }'`
		
		const cassClient = new Client (option)
		await cassClient.connect ()
			
		let result = await cassClient.execute (cmd0)
		//@ts-ignore
		let oldData: nodeType = result?.rows[0]
		const time = new Date ()
		const needDomain = oldData?.pgp_publickey_id === payload.gpgPublicKeyID1 ? false: true
		if (!oldData?.country) {
			payload.ip_api = await getIpaddressLocaltion ( payload.ipV4 )
		} else {
			payload.ip_api = {
				countryCode: oldData.country,
				region: oldData.region,
				lon: oldData.lon,
				lat: oldData.lat
			}
		}
		let cmd = 
					`INSERT INTO conet_si_nodes ( wallet_addr, ip_addr, outbound_fee, storage_fee, registration_date, `+
					`country, region, lat, lon, customs_review_total, `+
					`pgp_publickey_id, nft_tokenid, total_online, last_online, platform_verison) VALUES (` +
					` '${ payload.walletAddr }', '${ payload.ipV4 }', ${ payload.outbound_price }, ${ payload.storage_price }, '${ time.toISOString() }', `+
					`'${ payload.ip_api?.countryCode }', '${ payload.ip_api?.region }', ${ payload.ip_api?.lat }, ${ payload.ip_api?.lon }, ${ customs_review_total }, `+
					`'${ payload.gpgPublicKeyID1 }', '${ nft_tokenid }', 5, dateof(now()), '${ payload.platform_verison }' ) `

		// logger (inspect(cmd, false, 3, true))
		try {
			await cassClient.execute (cmd)
		} catch (ex) {
			await cassClient.shutdown()
			logger (ex)
			return false
		}

		resolve(nft_tokenid)
		await cassClient.shutdown()

		if ( process.connected && typeof process.send === 'function') {
			const comd: clusterMessage = {
				cmd:'si-node',
				data: [{ip_addr: payload.ipV4}],
				uuid: '',
				err: null
			}
			process.send (comd)
		}
		

		//await postRouterToPublic (payload, null, s3pass)
		needDomain ? await regiestCloudFlare (payload.ipV4, payload.gpgPublicKeyID1, masterSetup ): null
		
	})

	
}

export const CoNET_SI_health = async ( yyy: ICoNET_DL_POST_register_SI) => {

	if (!checkPayloadWalletSign(yyy)) {
		logger(Color.red(`CoNET_SI_health checkPayloadWalletSign Error!`))
		return false
	}

	if (!yyy.nft_tokenid) {
		logger (Color.red(`CoNET_SI_health have no nft_tokenid Error`), inspect( yyy, false, 3, true ))
		return false
	}
	
	const nft_tokenid = yyy.nft_tokenid

	const cmd = `Select * from conet_si_nodes WHERE nft_tokenid = '${ nft_tokenid }'`
	const cassClient = new Client (option)
	await cassClient.connect ()
	const res = await cassClient.execute (cmd)


	if (!res.rowLength ) {
		await cassClient.shutdown ()
		return logger (Color.red(`Select * from conet_si_nodes WHERE nft_tokenid = '${ nft_tokenid }' got null Error!`))
	}
	const oldData = res.rows[0]
	if ( oldData.pgp_publickey_id !== yyy.gpgPublicKeyID1 ) {
		await cassClient.shutdown ()
		logger (`CoNET_SI_health ERROR!, SI signPgpKeyID !== oldData.pgp_publickey_id payload = [${ inspect( yyy, false, 3, true ) }] DB = [${ inspect(oldData, false, 3, true) }]` )
		return false
	}
	const customs_review_total = (Math.random()*5).toFixed(2)
	oldData.customs_review_total = customs_review_total
	oldData.platform_verison = yyy.platform_verison
	oldData.armoredPublicKey = yyy.armoredPublicKey
	const cmd1 = `UPDATE conet_si_nodes SET customs_review_total = ${ customs_review_total }, total_online = ${ oldData.total_online} + 5, platform_verison = '${ yyy.platform_verison }', last_online = dateof(now()) Where country = '${ oldData.country }' and nft_tokenid = '${ nft_tokenid }'`
	await cassClient.execute (cmd1)
	await cassClient.shutdown ()
	
	if ( process.connected && typeof process.send === 'function') {
		const comd: clusterMessage = {
			cmd:'si-node',
			data: [oldData],
			uuid: '',
			err: null
		}
		process.send (comd)
	}
	
	return true

}

export const regiestFaucet = (wallet_addr: string, ipAddr: string ) => {
	
	return new Promise ( async resolve => {

		const cassClient = new Client (option)
		await cassClient.connect ()
		const time = new Date()

		
		let cmd = `SELECT * from conet_faucet_ipaddress WHERE client_ipaddress = '${ipAddr}'`

		let result = await cassClient.execute (cmd)

		if ( result?.rowLength > 3 && !checkDevelopIP(ipAddr)) {
			logger (Color.grey(`regiestFaucet IP address [${ ipAddr }] over 10 in 24 hours! STOP!`))
			await cassClient.shutdown ()
			return resolve (false)
		}

		wallet_addr = wallet_addr.toLowerCase()

		cmd = `SELECT * from conet_faucet_wallet_addr WHERE wallet_addr = '${ wallet_addr }'`
		result = await cassClient.execute (cmd)
		
		if ( result?.rowLength > 0 ) {
			//logger (Color.grey(`regiestFauce Wallet Address [${ wallet_addr }] did Faucet in 24 hours! STOP! `))
			await cassClient.shutdown ()
			return resolve (false)
		}

		//const receipt = await sendCONET (admin_private, FaucetCount, wallet_addr)


		const cmd2 = `INSERT INTO conet_faucet_ipaddress (client_ipaddress, timestamp) VALUES ('${ipAddr}', '${time.toISOString() }') USING TTL ${FaucetTTL}`
		const cmd3 = `INSERT INTO conet_faucet_wallet_addr (wallet_addr) VALUES ('${wallet_addr}') USING TTL ${FaucetTTL}`
		const cmd1 = `INSERT INTO conet_faucet (wallet_addr, timestamp, total, transaction_hash, client_ipaddress) VALUES ('${wallet_addr}', '${time.toISOString()}', ${ '1' }, '', '${ ipAddr }')`


		await cassClient.execute (cmd1)
		await cassClient.execute (cmd2)
		await cassClient.execute (cmd3)

		logger (Color.grey(`regiestFaucet [${wallet_addr}:${ipAddr}] SUCCESS`))
		await cassClient.shutdown ()
		return resolve ('OK')
		
	})
	
}

export const regiestFaucetBlast = (wallet_addr: string, ipAddr: string ) => {
	
	return new Promise ( async resolve => {

		const cassClient = new Client (option)
		await cassClient.connect ()
		const time = new Date()

		
		let cmd = `SELECT * from conet_faucet_ipaddress WHERE client_ipaddress = '${ipAddr}'`

		let result = await cassClient.execute (cmd)

		if ( result?.rowLength > 20 ) {
			logger (Color.grey(`regiestFaucet IP address [${ ipAddr }] over 10 in 24 hours! STOP!`))
			await cassClient.shutdown ()
			return resolve (false)
		}

		wallet_addr = wallet_addr.toUpperCase()

		cmd = `SELECT * from conet_faucet_wallet_addr WHERE wallet_addr = '${ wallet_addr }'`
		result = await cassClient.execute (cmd)
		
		if ( result?.rowLength > 0 ) {
			//logger (Color.grey(`regiestFauce Wallet Address [${ wallet_addr }] did Faucet in 24 hours! STOP! `))
			await cassClient.shutdown ()
			return resolve (false)
		}

		//const receipt = await sendCONET (admin_private, FaucetCount, wallet_addr)


		const cmd2 = `INSERT INTO conet_faucet_ipaddress (client_ipaddress, timestamp) VALUES ('${ipAddr}', '${time.toISOString() }') USING TTL ${FaucetTTL}`
		const cmd3 = `INSERT INTO conet_faucet_wallet_addr (wallet_addr) VALUES ('${wallet_addr}') USING TTL ${FaucetTTL}`
		const cmd1 = `INSERT INTO conet_faucet (wallet_addr, timestamp, total, transaction_hash, client_ipaddress) VALUES ('${wallet_addr}', '${time.toISOString()}', ${ '1' }, '', '${ ipAddr }')`


		await cassClient.execute (cmd1)
		await cassClient.execute (cmd2)
		await cassClient.execute (cmd3)

		logger (Color.grey(`regiestFaucet [${wallet_addr}:${ipAddr}] SUCCESS`))
		await cassClient.shutdown ()
		
		return resolve ('OK')
		
	})
	
}

const storeCoNET_market = (price: number, oneDayPrice: number) => {
	return new Promise ( async resolve => {
		const cassClient = new Client (option)
		await cassClient.connect ()
		const time = new Date()
		const cmd = `INSERT INTO conet_market (date, price, value_24hours, token_id) VALUES ('${time.toISOString()}', ${ price }, ${ oneDayPrice }, 'AVAX')`
		await cassClient.execute (cmd)
		await cassClient.shutdown ()
		return resolve (null)
	})
}

// export const streamCoNET_USDCPrice = (quere: any[]) => {

// 	quere.shift ()
// 	const option:RequestOptions = {
// 		host: 'min-api.cryptocompare.com',
// 		method: 'GET',
// 		path: '/data/pricemultifull?fsyms=AVAX&tsyms=USD',
// 		headers: {
// 			'accept': 'application/json'
// 		},
// 		port: 443
// 	}

// 	const req = request (option, res => {
// 		let _data = ''
// 		res.on ('data', data => {
// 			_data += data.toString ()
// 		})

// 		res.once ('end', async () => {

// 			let response
// 			try {
// 				response = JSON.parse (_data)
// 			} catch (ex) {
// 				return logger (Color.red(`streamCoNET_USDCInterval JSON.parse Error`), _data)
// 			}
			
// 			await storeCoNET_market (response.RAW.AVAX.USD.PRICE, response.RAW.AVAX.USD.VOLUME24HOUR)
// 			//logger (`streamCoNET_USDCInterval SUCCESS!, PRICE [${Color.green(response.RAW.AVAX.USD.PRICE)}] VOLUME24HOUR[${Color.green(response.RAW.AVAX.USD.VOLUME24HOUR)}]`)

// 		})
// 	})


// 	req.once ('error', err => {
// 		logger (Color.red(`streamCoNET_USDCPrice request Once Error`), err )
// 	})

// 	req.end (() => {
// 		if ( !quere.length ) {
// 			const kk = setTimeout (() => {
// 				streamCoNET_USDCPrice (quere)
// 			}, streamCoNET_USDCInterval)
// 			quere.unshift (kk)
// 		}
// 	})
	
	
// }

export const getLast5Price = () => {
	return new Promise ( async resolve => {
		const cassClient = new Client (option)
		await cassClient.connect ()
		const cmd = `SELECT date, price, value_24hours from conet_market where token_id ='AVAX' order by date DESC LIMIT 5`
		const res = await cassClient.execute (cmd)
		await cassClient.shutdown ()
		return resolve(res.rows)
	})
}
//	`CREATE TABLE IF NOT EXISTS conet_lotte (` +
// `wallet text, ` +
// `win_cntp double, ` +
// `reset_timestamp text,` +
// `PRIMARY KEY ((wallet), win_cntp)) WITH CLUSTERING ORDER BY (win_cntp DESC)`


export const conet_lotte_bio = (wallet: string, bio: string) => new Promise(async resolve=> {
	const cassClient = new Client (option)
	await cassClient.connect ()
	const cmd = `UPDATE conet_lotte_new SET bio = '${bio}' WHERE wallet = '${wallet}'`
	await cassClient.execute (cmd)
	await cassClient.shutdown()
	resolve (true)
})


export const restoreAllOld_lotte = () => new Promise(async resolve=> {
	const cassClient = new Client (option)
	const basetime = moment.utc()
	basetime.hour(0).minute(0).second(0).millisecond(0)			//		RESET TO 0 am 
	const weeklyTime = moment.utc(basetime).day(0)
	const monthlyTime = moment.utc(basetime).date(0)
	await cassClient.connect ()

	const cmd = `SELECT * from conet_lotte_new`
	const result = await cassClient.execute (cmd)
	let iii = 0
	logger(`start restoreAllOld_lotte length = ${result.rowLength}`)
	mapLimit(result.rows, 5, async (n, next) => {
		const cmd1 = `INSERT INTO conet_lotte_new_total (wallet, win_cntp, bio, kinds, timestamp) VALUES ('${n.wallet}', ${n.win_cntp}, '${n.bio}', 'total', 'total')`
		const cmd2 = `INSERT INTO conet_lotte_new_total (wallet, win_cntp, bio, kinds, timestamp) VALUES ('${n.wallet}', ${n.win_cntp}, '${n.bio}', 'weekly', '${weeklyTime.format('x')}')`
		const cmd3 = `INSERT INTO conet_lotte_new_total (wallet, win_cntp, bio, kinds, timestamp) VALUES ('${n.wallet}', ${n.win_cntp}, '${n.bio}', 'daliy', '${basetime.format('x')}')`
		const cmd4 = `INSERT INTO conet_lotte_new_total (wallet, win_cntp, bio, kinds, timestamp) VALUES ('${n.wallet}', ${n.win_cntp}, '${n.bio}', 'monthly', '${monthlyTime.format('x')}')`
		await Promise.all([
			cassClient.execute (cmd1),
			cassClient.execute (cmd2),
			cassClient.execute (cmd3),
			cassClient.execute (cmd4)
		])
		
		logger(`${iii++} setup ${n.wallet} => ${n.win_cntp}`)
	}, async err => {
		await cassClient.shutdown()
		logger(`success!`)
	})
	
})

export const conet_lotte = (wallet: string, winlotte: number) => new Promise(async resolve=> {
	const cassClient = new Client (option)
	await cassClient.connect ()
	const time = new Date().getTime()

	const cmd = `SELECT * from conet_lotte_new WHERE wallet = '${wallet}'`
	
	const result = await cassClient.execute (cmd)
	logger(inspect(result.rows[0], false, 3, true))
	const win_cntp = winlotte + (result.rows[0]?.win_cntp||0)
	
	const cmd1 = `INSERT INTO conet_lotte_new (wallet, win_cntp, reset_timestamp) VALUES ('${wallet}', ${win_cntp}, '${time}')`
	logger(Color.blue(`${cmd1}`))
	await cassClient.execute (cmd1)
	await cassClient.shutdown()
	resolve(true)
})

export const conet_lotte_new = (wallet: string, winlotte: number) => new Promise(async resolve=> {
	const cassClient = new Client (option)
	const timeNow = new Date().getTime()
	const basetime = moment.utc()
	basetime.hour(0).minute(0).second(0).millisecond(0)			//		RESET TO 0 am 
	const weeklyTime = moment.utc(basetime).day(0)
	const monthlyTime = moment.utc(basetime).date(0)

	const cmd = `SELECT * from conet_lotte_new WHERE wallet = '${wallet}'`
	await cassClient.connect ()
	const result = await cassClient.execute (cmd)

	const data = result.rows[0]
	const _timestamp = data?.reset_timestamp
	const timestamp = _timestamp ? (/\:/.test(_timestamp) ? new Date(_timestamp).getTime():parseInt(_timestamp)) : 0
	const isDaliy =  timestamp - parseInt(basetime.format('x')) > 0
	const isWeekly = timestamp - parseInt(weeklyTime.format('x')) > 0
	const isMonthly = timestamp - parseInt(monthlyTime.format('x')) > 0

	const total_cntp = (data?.win_cntp||0) + winlotte
	const daliy_cntp = isDaliy ? ((data?.win_cntp_daliy||0) + winlotte) : winlotte
	const weekly_cntp = isWeekly ? ((data?.win_cntp_weekly||0) + winlotte) : winlotte
	const monthly_cntp = isMonthly ? ((data?.win_cntp_monthly||0) + winlotte) : winlotte
	const cmdPool = []
	cmdPool.push(`INSERT INTO conet_lotte_new (wallet, win_cntp, win_cntp_weekly, win_cntp_daliy, win_cntp_monthly, reset_timestamp) VALUES ('${wallet}', ${total_cntp}, ${weekly_cntp}, ${daliy_cntp}, ${monthly_cntp}, '${timeNow}')`)
	cmdPool.push(`INSERT INTO conet_lotte_new_total (wallet, win_cntp, bio, kinds, timestamp) VALUES ('${wallet}', ${total_cntp}, '${data?.bio}', 'total', 'total')`)
	cmdPool.push(`INSERT INTO conet_lotte_new_total (wallet, win_cntp, bio, kinds, timestamp) VALUES ('${wallet}', ${total_cntp}, '${data?.bio}', 'weekly', '${weeklyTime.format('x')}')`)
	cmdPool.push(`INSERT INTO conet_lotte_new_total (wallet, win_cntp, bio, kinds, timestamp) VALUES ('${wallet}', ${total_cntp}, '${data?.bio}', 'daliy', '${basetime.format('x')}')`)
	cmdPool.push(`INSERT INTO conet_lotte_new_total (wallet, win_cntp, bio, kinds, timestamp) VALUES ('${wallet}', ${total_cntp}, '${data?.bio}', 'monthly', '${monthlyTime.format('x')}')`)
	
	mapLimit(cmdPool, 1, async (n, next) => {
		await cassClient.execute (n)

	}, async err => {
		await cassClient.shutdown()
		resolve(true)
	})
	
})

interface lottleArray {
	wallet: string
	win_cntp: number
}

export const listAllLotte = () => new Promise(async resolve=> {
	const basetime = moment.utc()
	basetime.hour(0).minute(0).second(0).millisecond(0)			//		RESET TO 0 am 
	const weeklyTime = moment.utc(basetime).day(0)
	const monthlyTime = moment.utc(basetime).date(0)
	const cassClient = new Client (option)
	const cmd1 = `SELECT * FROM conet_lotte_new_total WHERE kinds = 'total' and timestamp = 'total' LIMIT 20`
	const cmd2 = `SELECT * FROM conet_lotte_new_total WHERE kinds = 'weekly' and timestamp = '${weeklyTime.format('x')}' LIMIT 20`
	const cmd3 = `SELECT * FROM conet_lotte_new_total WHERE kinds = 'daliy' and timestamp = '${basetime.format('x')}' LIMIT 20`
	const cmd4 = `SELECT * FROM conet_lotte_new_total WHERE kinds = 'monthly' and timestamp = '${monthlyTime.format('x')}' LIMIT 20`

	

	await cassClient.connect ()
	const [result, result_weekly, result_daliy, result_monthly] = await Promise.all([
		
		cassClient.execute (cmd1),
		cassClient.execute (cmd2),
		cassClient.execute (cmd3),
		cassClient.execute (cmd4),
	])
	await cassClient.shutdown()

	logger(inspect(result.rows))
	logger(inspect(result_weekly.rows))
	logger(inspect(result_daliy.rows))
	logger(inspect(result_monthly.rows))
	resolve({weekly: result_weekly.rows, daliy: result_daliy.rows, monthly: result_monthly.rows, totally: result.rows})
})


// export const exchangeUSDC = (txHash: string) => {
// 	return new Promise ( async resolve => {
// 		const _res = await getCONETConfirmations (txHash, admin_public)
// 		if (!_res) {
// 			logger (`getConfirmations have no data!`)
// 			return resolve(false)
// 		}
// 		logger (inspect(_res, false, 3, true ))
// 		const cassClient = new Client (option)
// 		await cassClient.connect ()
// 		const cmd2 = `SELECT from_transaction_hash from conet_usdc_exchange where from_addr = '${ _res.from.toUpperCase() }' and from_transaction_hash = '${ txHash.toUpperCase() }'`
// 		const rowLength = await cassClient.execute (cmd2)
		
// 		if ( rowLength.rowLength > 0 ) {
// 			logger (`exchangeUSDC txHash[${ txHash }] already had data!`)
// 			await cassClient.shutdown ()
// 			return resolve(false)
// 		}
// 		logger (inspect(rowLength, false, 3, true))
// 		const cmd = `SELECT price from conet_market where token_id ='AVAX' order by date DESC LIMIT 1`
// 		const rate = (await cassClient.execute (cmd)).rows[0].price
// 		const usdc = rate * _res.value

// 		const obj = {
// 			gas: 21000,
// 			to: _res.from,
// 			value: (usdc * wei).toString()
// 		}
// 		const eth = new Eth ( new Eth.providers.HttpProvider(USDCNET))
// 		const time = new Date()
// 		let createTransaction
// 		try {
// 			createTransaction = await eth.accounts.signTransaction( obj, admin_private )
// 		} catch (ex) {
// 			await cassClient.shutdown ()
// 			logger (`exchangeUSDC eth.sendSignedTransaction ERROR`, ex )
// 			return resolve(false)
// 		}
// 		const receipt = await eth.sendSignedTransaction (createTransaction.rawTransaction )
// 		const cmd1 = `INSERT INTO conet_usdc_exchange (from_addr, timestamp, from_transaction_hash, rate, total_conet, total_usdc, transaction_hash) VALUES (` +
// 			`'${ _res.from.toUpperCase() }', '${time.toISOString()}', '${ txHash.toUpperCase() }', ${rate}, ${ _res.value }, ${ usdc }, '${receipt.transactionHash.toUpperCase()}')`
// 		await cassClient.execute (cmd1)
// 		await cassClient.shutdown ()
// 		return resolve(receipt.transactionHash)
// 	})
	
	


// }

// export const mint_conetcash = async (txObj: {tx: string, to: string}, txObjHash: string, sign: string ) => {

// 	// @ts-ignore
// 	const _txObjHash = hash.keccak256(txObj)
// 	if ( txObjHash !== _txObjHash) {
// 		logger (`mint_conetcash Error: _txObjHash [${_txObjHash}] !== [${ txObjHash }]`)
// 		return false
// 	}

// 	const usdcData = await getConfirmations( txObj.tx, admin_public, USDCNET )
// 	if ( !usdcData || usdcData.value <= 0 || usdcData.value > 100 ) {
// 		logger (`mint_conetcash have no usdcData or usdcData.value have not in []`, inspect(usdcData, false, 3, true))
// 		return false
// 	}
	
// 	const cassClient = new Client (option)
// 	await cassClient.connect ()
// 	const cmd1 = `SELECT from_transaction_hash from conet_dl_conetcash where asset_name = '${ asset_name }' and from_transaction_hash = '${ txObj.tx.toUpperCase()}'`
// 	const rowLength = (await cassClient.execute (cmd1)).rowLength
// 	if (rowLength > 0) {
// 		await cassClient.shutdown ()
// 		logger (`mint_conetcash ERROR: had same txHash [${ txObj.tx }]`)
// 		return false
// 	}

// 	txObj.to = txObj.to.toUpperCase()


// 	const keyID: string = recover(sign, _txObjHash).toUpperCase()
// 	if (keyID !== usdcData.from.toUpperCase()) {
// 		return false
// 	}

	
// 	const time = new Date()
// 	const fee = usdcData.value * CoNETCashFee
// 	const balance = usdcData.value - fee
// 	const id = v4().toUpperCase()
// 	const cmd2 = `INSERT INTO conet_dl_conetcash (owner_addr, asset_name, from_transaction_hash, timestamp, deposit_tokens, balance, dl_id, Genesis_Fee, transfer_fee_total) VALUES (` + 
// 		`'${txObj.to}', '${ asset_name }', '${ txObj.tx.toUpperCase() }', '${ time.toISOString() }', ${ usdcData.value }, ${ balance }, '${ id }', ${ fee }, 0)`
// 	await cassClient.execute (cmd2)
// 	const cmd3 = `INSERT INTO conet_dl_conetcash_dl_id (owner_addr, asset_name, from_transaction_hash, timestamp, deposit_tokens, balance, dl_id, Genesis_Fee, transfer_fee_total) VALUES (` + 
// 		`'${ txObj.to }', '${ asset_name }', '${ txObj.tx.toUpperCase() }', '${ time.toISOString() }', ${ usdcData.value }, ${ balance }, '${ id }', ${ fee }, 0)`
// 	await cassClient.execute (cmd3)
// 	await cassClient.shutdown ()
// 	return id
// }

export const conetcash_getBalance = (id: string ) => {
	return new Promise( async resolve => {
		const cmd1 = `SELECT * from conet_dl_conetcash_dl_id where asset_name='${asset_name}' and dl_id='${ id }'`
		const cassClient = new Client (option)
		await cassClient.connect ()
		const data =  (await cassClient.execute (cmd1)).rows[0]
		await cassClient.shutdown ()
		if (!data) {
			return resolve({})
		}
		const ret = {
			id: data.dl_id,
			balance: data.balance,
			owner: data.owner_addr
		}
		return resolve(ret)
	})
}

export const authorizeCoNETCash = async ( Cobj: CoNETCash_authorized, objHash: string, sign: string ) => {

		// @ts-ignore
		const _txObjHash = hash.keccak256(Cobj)

		if ( _txObjHash !== objHash ) {
			return  (null)
		}

		let signAddr = ''
		let obj: CoNETCash_authorized
		try {
			signAddr = recover(sign, _txObjHash).toUpperCase()
		} catch (ex) {
			logger (Color.red(`authorizeCoNETCash ${Cobj} recover sign & _txObjHash Error`), ex)
			return  (null)
		}

		const cassClient = new Client (option)
		await cassClient.connect ()

		const cmd = `SELECT * from conet_dl_conetcash_dl_id where dl_id = '${ Cobj.id }' and asset_name = '${asset_name}'`

		const result = await cassClient.execute (cmd)

		if ( !result.rows?.length ) {
			await cassClient.shutdown ()
			logger (Color.red(`authorizeCoNETCash ${Cobj} have no record in conet_dl_conetcash_dl_id Error`))
			return (null)
		}
		const row = result.rows[0]
		const fee = Cobj.amount * CoNETCashFee
		const balance = row.balance - fee - Cobj.amount

		if ( row.owner_addr !== signAddr.toUpperCase() || balance < 0 ) {
			await cassClient.shutdown ()
			logger (Color.red(`authorizeCoNETCash owner_addr !== signAddr or balance [${balance}] < amount [${ Cobj.amount }] Error`))
			return (null)
		}
		const transfer_fee_total = row.transfer_fee_total + fee

		const cmd1 = `UPDATE conet_dl_conetcash_dl_id SET balance = ${ balance }, transfer_fee_total = ${ transfer_fee_total } where asset_name = '${asset_name}' and dl_id = '${ Cobj.id }'`
		const cmd2 = `UPDATE conet_dl_conetcash SET balance = ${ balance }, transfer_fee_total = ${ transfer_fee_total } where asset_name = '${asset_name}' and from_transaction_hash = '${ row.from_transaction_hash }'`
		try {
			await cassClient.execute (cmd1)
			await cassClient.execute (cmd2)
		} catch (ex) {
			await cassClient.shutdown ()
			logger (Color.red(`execute (cmd1) execute (cmd2) ERROR` ), ex)
			return (null)
		}
		
		const id = v4().toUpperCase()
		const time = new Date()
		const cmd3 = `INSERT INTO conet_dl_conetcash (owner_addr, asset_name, from_transaction_hash, timestamp, deposit_tokens, balance, dl_id, Genesis_Fee, transfer_fee_total) VALUES (` + 
			`'${Cobj.to}', '${ asset_name }', '${ Cobj.id }', '${ time.toISOString() }', ${ Cobj.amount }, ${ Cobj.amount }, '${ id }', 0, 0)`
		
		const cmd4 = `INSERT INTO conet_dl_conetcash_dl_id (owner_addr, asset_name, from_transaction_hash, timestamp, deposit_tokens, balance, dl_id, Genesis_Fee, transfer_fee_total) VALUES (` + 
			`'${Cobj.to}', '${ asset_name }', '${ Cobj.id }', '${ time.toISOString() }', ${ Cobj.amount }, ${ Cobj.amount }, '${ id }', 0, 0)`
		try {
			await cassClient.execute (cmd3)
			await cassClient.execute (cmd4)
		} catch (ex) {
			await cassClient.shutdown ()
			logger (Color.red(`execute (cmd3) execute (cmd4) ERROR` ), ex)
			return (null)
		}
		
		await cassClient.shutdown ()

		return (id)
	
}

const AttackTTL = 15

export const getIpAttack = async (ipaddress: string, node: string, callback: (err:Error|null, isAttack?: any)=> void) => {
	const cassClient = new Client (option)
	const time = new Date().getTime()
	const cmd = `INSERT INTO const_api_attack (ipaddress, node, timestamp) VALUES ('${ipaddress}', '${node}', '${time}') USING TTL ${AttackTTL}`
	const cmd1 = `SELECT * from const_api_attack WHERE ipaddress = '${ ipaddress }'`
	let data
	try {
		data = await cassClient.execute (cmd1)
		if (data.rowLength > AttackTTL * 5 ) {
			return callback(null, true)
		}
		callback(null, false)
		await cassClient.execute (cmd)
	} catch (ex: any) {
		await cassClient.shutdown()
		logger (ex)
		return callback(null, false)
	}

	await cassClient.shutdown()
	
	
}

export const getOraclePrice: () => Promise<assetsStructure[]|boolean> = () => new Promise(async resolve => {
	const cassClient = new Client (option)
	const cmd = `SELECT * from conet_crypto_price WHERE currency_name = 'eth' order by timestamp DESC LIMIT 1`
	const cmd1 = `SELECT * from conet_crypto_price WHERE currency_name = 'bnb' order by timestamp DESC LIMIT 1`
	const [eth, bnb] = await Promise.all ([
		cassClient.execute (cmd),
		cassClient.execute (cmd1)
	])
	await cassClient.shutdown()
	//@ts-ignore
	
	resolve ([eth.rows[0], bnb.rows[0]])
})


export const txManager: (tx: string, tokenName: string, payment_address: string, nodes: number, network: string, message: string, signMessage: string) 
	=> Promise<boolean> = (_tx, tokenName, payment_address, nodes, network, message, signMessage) => new Promise(async resolve => {
	const cassClient = new Client (option)
	const tx = _tx.toLowerCase()
	const cmd = `SELECT * from conet_guardian_receipt WHERE tx = '${tx}'`
	const cmd1 = `INSERT INTO conet_guardian_receipt (payment_address, nodes, token_name, tx, timestamp, network, message, signMessage) VALUES (`+
	`'${payment_address.toLowerCase()}', ${nodes}, '${tokenName}', '${tx}', '${new Date().toISOString()}', '${network}', '${message}', '${signMessage}')`
	try {
		const data = await cassClient.execute (cmd)
		if (data.rowLength !== 0) {
			await cassClient.shutdown()
			return resolve(false)
		}
		await cassClient.execute (cmd1)
		await cassClient.shutdown()
		return resolve(true)
	}
	catch(ex) {
		logger(Color.red(`txManager catch ex`), ex)
		await cassClient.shutdown()
		resolve(false)
	}
	
})




let EPOCH: number
export let totalminerOnline = 0
let minerRate = 0
let transferEposh = 0




const _provider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
const privateKey = masterSetup.conetFaucetAdmin[0]
export const nodeWallet = new ethers.Wallet(privateKey, _provider).address.toLowerCase()

export const regiestMiningNode = async () => {
	
	const ipaddress = getServerIPV4Address(true)[0]
	if (!ipaddress) {
		return logger(Color.red(`regiestMiningNode Mining Server only has local IP address Error!`))
	}
	
	const cmd = `INSERT INTO conet_mining_nodes (node_ipaddress, wallet) VALUES ('${ipaddress}', '${nodeWallet}')`
	const cassClient = new Client (option)
	try {
		await cassClient.execute(cmd)
		await cassClient.shutdown()
	} catch(ex: any) {
		return logger(Color.red(`regiestMiningNode save data to Database ${cmd} Error ${ex.message}`))
	}
	return logger(Color.blue(`regiestMiningNode ${cmd} success!`))
}

export const getAllMinerNodes = async () => {
	const cassClient = new Client (option)
	const cmd = `SELECT * FROM conet_mining_nodes`
	try {
		const ret = await cassClient.execute(cmd)
		await cassClient.shutdown()
		return ret.rows
	} catch(ex: any) {
		return logger(Color.red(`getAllMinerNodes ${cmd} Error ${ex.message}`))
	}
}



const checkLastClaimeTime = async (assetName: string, wallet: string) => {
	const cassClient = new Client (option)
	const cmd = `SELECT * FROM conet_claimable_asset WHERE asset_name = '${assetName}' AND recipient_wallet = '${wallet}' LIMIT 1`
	try {
		const miners = await cassClient.execute (cmd)
		await cassClient.shutdown()
		return miners.rows
	} catch (ex) {
		await cassClient.shutdown()
		logger(Color.blue(`checkLastClaimeTime `))
	}
	return null
}


export const claimeToekn = async (message: string, signMessage: string ) => {
	const obj = checkSignObj (message, signMessage)
	if (!obj || !obj?.data) {
		logger(Color.red(`claimeToekn obj Error!`), `\nmessage=[${message}]\nsignMessage=[${signMessage}]`)
		return false
	}
	logger(Color.blue(`claimeToekn message=[${message}]`))
	logger(Color.blue(`claimeToekn signMessage=[${signMessage}]`))
	const data = obj.data
	if (!data?.tokenName) {
		logger(Color.red(`claimeToekn hasn't data.tokenName Error!`), `\nmessage=[${message}]\nsignMessage=[${signMessage}]`)
		return false
	}
	logger(inspect(obj))
	//const kk = await checkLastClaimeTime(data.tokenName, obj.walletAddress)
	return await checkClaimeToeknbalance(obj.walletAddress, data.tokenName)
}


export const checkIpAddress = async (ipaddress: string) => {
	const cassClient = new Client (option)
	const cmd = `SELECT ipaddress from conet_free_mining WHERE ipaddress = '${ipaddress}'`
	try {
		const jj = await cassClient.execute (cmd)
		await cassClient.shutdown()
		return (jj.rowLength)
	} catch (ex) {
		await cassClient.shutdown()
		return null
	}
	
}


export const regiestApiNode1: () => Promise<boolean> = async () => new Promise(async resolve=> {

	const cassClient = new Client (option)
	const ipaddress = getServerIPV4Address(false)
	const wallet = new ethers.Wallet(privateKey)

	const cmd1 = `INSERT INTO conet_api_node (wallet, ipaddress) VALUES ('${wallet.address}', '${ipaddress[0]}')`
	try {
		cassClient.execute (cmd1)
		await cassClient.shutdown()
		logger(Color.blue(`regiestApiNode1 [`+Color.yellow(`${ipaddress}:#{}`)+`] success!`))
		return resolve(true)
	} catch(ex) {
		await cassClient.shutdown()
		return resolve (false)
	}
})

export const storeLeaderboardGuardians_referralsv2 = (epoch: string, guardians_referrals: string, guardians_cntp: string, guardians_referrals_rate_list: string) => new Promise(async resolve=> {
	const cassClient = new Client (option)
	const cmd1 = `UPDATE conet_leaderboard SET guardians_referrals = '${guardians_referrals}', guardians_cntp='${guardians_cntp}',guardians_referrals_rate_list = '${guardians_referrals_rate_list}' WHERE conet = 'conet' AND epoch = '${epoch}'`
	//logger(Color.blue(`storeLeaderboardGuardians_referrals ${cmd1}`))
	try {
		cassClient.execute (cmd1)
	} catch(ex) {
		await cassClient.shutdown()
		logger(Color.red(`storeLeaderboardGuardians_referrals Error!`), ex)
		return resolve(false)
	}
	await cassClient.shutdown()
	logger(Color.magenta(`storeLeaderboardGuardians_referrals [${epoch}] finished`))
	resolve(true)
})


export const storeLeaderboardFree_referrals = async (epoch: string, free_referrals: string, free_cntp: string, free_referrals_rate_list: string, totalMiner: string, minerRate: string) => {
	const cassClient = new Client (option)

	const cmd1 = `UPDATE conet_leaderboard SET free_referrals = '${free_referrals}', free_cntp = '${free_cntp}', free_referrals_rate_list = '${free_referrals_rate_list}', totalMiner = '${totalMiner}', minerRate= '${minerRate}' WHERE conet = 'conet' AND epoch = '${epoch}'`
	logger(Color.blue(`storeLeaderboardFree_referrals totalMiner epoch [${epoch}] [${totalMiner}] minerRate[${minerRate}]`))
		try {
			cassClient.execute (cmd1)
		} catch(ex) {
			logger(`storeLeaderboardFree_referrals Error`, ex)
			await cassClient.shutdown()
			return false
		}
		await cassClient.shutdown()
		logger(Color.magenta(`storeLeaderboard Free_referrals [${epoch}] success!`))
		return true
}

export const selectLeaderboard = async () => {
	const cmd1 = `SELECT * from conet_leaderboard limit 10`
	const cassClient = new Client (option)
	try {
		const kk = await cassClient.execute (cmd1)
		await cassClient.shutdown()
		const result = kk.rows.filter(n => n.free_cntp && n.free_referrals)[0]
		
		const ret = {
			epoch: result.epoch,
			free_cntp: JSON.parse(result.free_cntp),
			free_referrals: JSON.parse(result.free_referrals),
			guardians_cntp: JSON.parse(result.guardians_cntp),
			guardians_referrals: JSON.parse(result.guardians_referrals),
			free_referrals_rate_list: JSON.parse(result.free_referrals_rate_list),
			guardians_referrals_rate_list: JSON.parse(result.guardians_referrals_rate_list),
			minerRate: result.minerrate,
			totalMiner: result.totalminer
		}
		return ret
		
	} catch(ex) {
		await cassClient.shutdown()
		return null
	}
}


export const selectLeaderboardEpoch = async (epoch: string) => {
	const cmd1 = `SELECT * from conet_leaderboard_v1`
	const cassClient = new Client (option)
	let kk
	try {
		kk = await cassClient.execute (cmd1)
		
	} catch(ex) {
		await cassClient.shutdown()
		return null
	}
	await cassClient.shutdown()
	logger(inspect(kk, false, 3, true))
	return (kk.rows)
}


export const storeLeaderboardGuardians_referralsV1 = (epoch: string, guardians_referrals: string, guardians_cntp: string, guardians_referrals_rate_list: string) => new Promise(async resolve=> {
	const cassClient = new Client (option)
	const cmd1 = `UPDATE conet_leaderboard_v1 SET referrals = '${guardians_referrals}', cntp='${guardians_cntp}',referrals_rate_list = '${guardians_referrals_rate_list}' WHERE conet = 'guardians' AND epoch = '${epoch}'`
	//logger(Color.blue(`storeLeaderboardGuardians_referrals ${cmd1}`))
	try {
		cassClient.execute (cmd1)
	} catch(ex) {
		await cassClient.shutdown()
		console.error(Color.red(`storeLeaderboardGuardians_referrals [${epoch}] Error!`), ex)
		return resolve(false)
	}
	await cassClient.shutdown()
	console.error(Color.magenta(`storeLeaderboardGuardians_referrals [${epoch}] finished`))
	resolve(true)
})
//			getIpAddressFromForwardHeader(req.header(''))
export const getIpAddressFromForwardHeader = (req: Request) => {
	const ipaddress = req.headers['X-Real-IP'.toLowerCase()]
	if (!ipaddress || typeof ipaddress !== 'string') {
		let kk = req.socket?.remoteAddress
		if (!kk) {
			return null
		}

		if (isV6Format(kk)) {
			const kk1 = kk.split(':')
			const ip4 = kk1[kk1.length - 1]
			return isV4Format(ip4) ? ip4 : null
		}
		return kk
		
	}

	return ipaddress
}