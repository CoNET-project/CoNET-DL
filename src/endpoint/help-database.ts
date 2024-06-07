
import type { TLSSocketOptions } from 'node:tls'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { homedir, platform } from 'node:os'
import { logger, getIpaddressLocaltion, regiestCloudFlare, sendCONET, getCONETConfirmations, conet_Holesky_rpc, transferCCNTP, checkSignObj, checkClaimeToeknbalance, getServerIPV4Address} from '../util/util'
import { createHash } from 'node:crypto'
import type {RequestOptions} from 'node:http'
import {v4} from 'uuid'
import {encryptWithPublicKey, createIdentity, hash, decryptWithPrivateKey, recover } from 'eth-crypto'
import type { GenerateKeyOptions, Key, PrivateKey, Message, MaybeStream, Data, DecryptMessageResult, WebStream, NodeStream } from 'openpgp'
import type {Response, Request } from 'express'
import Color from 'colors/safe'
import {Wallet, ethers} from 'ethers'
import { Client, auth, types } from 'cassandra-driver'
import {transferPool, startTransfer} from '../util/transferManager'
const setup = join( homedir(),'.master.json' )
import {request as HttpsRequest } from 'node:https'
import {sign} from 'eth-crypto'
import { address, isPublic} from 'ip'

const masterSetup: ICoNET_DL_masterSetup = require ( setup )


const FaucetTTL = 60 * 60 * 24
const clusterManagerHostname = 'apitest.conet.network'

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

const option = {
	contactPoints : masterSetup.Cassandra.databaseEndPoints,
	localDataCenter: 'dc1',
	authProvider: new auth.PlainTextAuthProvider ( masterSetup.Cassandra.auth.username, masterSetup.Cassandra.auth.password ),
	sslOptions: sslOptions,
	keyspace: masterSetup.Cassandra.keyspace,
	protocolOptions: { maxVersion: types.protocolVersion.v4 }
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

		if ( result?.rowLength > 1 ) {
			logger (Color.grey(`regiestFaucet IP address [${ ipAddr }] over 10 in 24 hours! STOP!`))
			await cassClient.shutdown ()
			return resolve (false)
		}

		wallet_addr = wallet_addr.toLowerCase()

		cmd = `SELECT * from conet_faucet_wallet_addr WHERE wallet_addr = '${ wallet_addr }'`
		result = await cassClient.execute (cmd)
		
		if ( result?.rowLength > 0 ) {
			logger (Color.grey(`regiestFauce Wallet Address [${ wallet_addr }] did Faucet in 24 hours! STOP! `))
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
			logger (Color.grey(`regiestFauce Wallet Address [${ wallet_addr }] did Faucet in 24 hours! STOP! `))
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



export const sendMesageToCluster = async (path: string, _data: any, callbak: (err: number|undefined, data?: any)=> void) => {
	const option: RequestOptions = {
		hostname: clusterManagerHostname,
		path,
		port: 443,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		}
	}
	
	const req = await HttpsRequest (option, async res => {
		let data = ''
		//logger(Color.grey(`sendMesageToCluster got response res Status ${res.statusCode}`))

		if (res.statusCode !== 200) {
			if (res.statusCode === 401) {
				logger(Color.blue(`sendMesageToCluster got initData request!`))
				//	let client try again
			
				if (!sendAlldataProcess) {
					sendAlldataProcess = true
					await sendAlldata ()
					sendAlldataProcess = false
				}
				return setTimeout(async () => {
					return sendMesageToCluster(path, _data, callbak)
				}, 2000)
				
			}
			return callbak(res.statusCode)
		}


		res.on('data', _data => {
			data += _data
		})

		res.once('end', () => {

			try {
				const ret = JSON.parse(data)
				return callbak (undefined, ret)
			} catch (ex: any) {
				console.error(`getReferrer JSON.parse(data) Error!`, data)
				return callbak (403)
			}
			
		})

		res.once('error', err => {
			logger(Color.red(`sendMesageToCluster res on error!`))
			logger(err)
			return callbak (503)
		})
	})

	req.once('error', (e) => {
		console.error(`getReferrer req on Error! ${e.message}`)
		return callbak (503)
	})

	req.write(JSON.stringify(_data))
	req.end()
}

export const deleteAMiner = (ipaddress: string, wallet: string ) => new Promise( resolve => {
	if (!isPublic(ipaddress)) {
		logger(Color.grey(`checkMiner [${ipaddress}:${wallet}] has a Local IP address!`))
		return resolve (false)
	}
	const message =JSON.stringify({ipAddress: ipaddress, walletAddress: nodeWallet, walletAddress1: wallet})
	const messageHash = ethers.id(message)
	const signMessage = sign(masterSetup.conetFaucetAdmin, messageHash)
	const sendData = {
		message, signMessage
	}

	return sendMesageToCluster('/api/deleteMiner', sendData, (err, data) => {
		if (err) {
			logger(Color.red(`deleteAMiner sendMesageToCluster /api/deleteMiner gor Error${err}`))
			//	let client try again
			return resolve (false)
		}
		return resolve (true)
	})
})



export const sendAlldata = () => new Promise( resolve => {
	const minerArray: minerArray[]  = []
	livenessListeningPool.forEach((v, k) => {
		minerArray.push({address: v.ipaddress, wallet: v.wallet})
	})

	const message =JSON.stringify({ walletAddress: nodeWallet, data: minerArray})
	const messageHash = ethers.id(message)
	const signMessage = sign(masterSetup.conetFaucetAdmin, messageHash)
	const sendData = {
		message, signMessage
	}

	return sendMesageToCluster('/api/initNode', sendData, (err, data) => {
		if (err) {
			logger(Color.grey(`sendAlldata sendMesageToCluster /api/minerCheck gor Error${err}`))
			//	let client try again
			
			return resolve (err)
		}
		return resolve (data)
	})
})

let sendAlldataProcess = false

export const checkMiner = (ipaddress: string, wallet: string ) => new Promise( resolve => {
	if (!isPublic(ipaddress)) {
		logger(Color.grey(`checkMiner [${ipaddress}:${wallet}] has a Local IP address!`))
		return resolve (false)
	}
	const message =JSON.stringify({ipAddress: ipaddress, walletAddress: nodeWallet, walletAddress1: wallet})
	const messageHash = ethers.id(message)
	const signMessage = sign(masterSetup.conetFaucetAdmin, messageHash)
	const sendData = {
		message, signMessage
	}

	return sendMesageToCluster('/api/minerCheck', sendData, async (err, data) => {
		if (err) {

			
			return resolve (err)
		}
		return resolve (data)
	})
})

export const launshAndDeleteAllWalletInCLuster = () => new Promise( resolve => {
	const message =JSON.stringify({walletAddress: nodeWallet})
	const messageHash = ethers.id(message)
	const signMessage = sign(masterSetup.conetFaucetAdmin, messageHash)
	const sendData = {
		message, signMessage
	}

	return sendMesageToCluster('/api/nodeRestart', sendData, (err, data) => {
		if (err) {
			logger(Color.grey(`checkMiner sendMesageToCluster /api/minerCheck gor Error${err}`))
			//	let client try again
			return resolve (false)
		}
		return resolve (data)
	})
	
})


export const getMinerCount = () => new Promise( resolve => {
	const message =JSON.stringify({walletAddress: nodeWallet})
	const messageHash = ethers.id(message)
	const signMessage = sign(masterSetup.conetFaucetAdmin, messageHash)
	const sendData = {
		message, signMessage
	}

	return sendMesageToCluster('/api/getTotalMiners', sendData, (err, data) => {
		if (err) {
			logger(Color.grey(`checkMiner sendMesageToCluster /api/minerCheck gor Error${err}`))
			//	let client try again
			return resolve (false)
		}
		return resolve (data)
	})
	
})


let EPOCH: number
export let totalminerOnline = 0
let minerRate = 0
let transferEposh = 0
export const tokensEachEPOCH = 34.72

interface livenessListeningPoolObj {
	res: Response
	ipaddress: string
	wallet: string
}


const livenessListeningPool: Map <string, livenessListeningPoolObj> = new Map()
const _provider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
export const nodeWallet = new ethers.Wallet(masterSetup.conetFaucetAdmin, _provider).address.toLowerCase()


const testMinerCOnnecting = (res: Response<any, Record<string, any>>, returnData: any, wallet: string, ipaddress: string) => new Promise (resolve=> {
	returnData['wallet'] = wallet
	if (res.writable && !res.closed) {
		return res.write( JSON.stringify(returnData)+'\r\n\r\n', async err => {
			if (err) {
				deleteAMiner(ipaddress, wallet)
				logger(Color.grey (`stratliveness write Error! delete ${wallet}`))
				livenessListeningPool.delete(wallet)
			}
			return resolve (true)
		})
		
	}
	deleteAMiner(ipaddress, wallet)
	livenessListeningPool.delete(wallet)
	logger(Color.grey (`stratliveness write Error! delete ${wallet}`))
	return resolve (true)
})


export const regiestMiningNode = async () => {
	
	const ipaddress = getServerIPV4Address(false)[0]
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


const transferMiners = async () => {
	const tryTransfer = async () => {

		const data: any = await getMinerCount ()

		if ( data === false || !data?.totalMiner) {
			return logger(Color.red(`transferMiners EPOCH [${EPOCH}] getMinerCount return Error!`), inspect(data, false, 3, true)) 
		}

		totalminerOnline = data.totalMiner
		minerRate = tokensEachEPOCH/totalminerOnline
		
		const paymentWallet: string[] = []
		livenessListeningPool.forEach (n => {
			paymentWallet.push(n.wallet)
		})
		
		if (paymentWallet.length > 0) {

			transferPool.push({
				privateKey: masterSetup.conetFaucetAdmin,
				walletList: paymentWallet,
				payList: paymentWallet.map(n => minerRate.toFixed(10))
			})
			await startTransfer()
		}
		
	}
	
	await tryTransfer()
	
}


const stratlivenessV2 = async (block: number) => {
	
	
	logger(Color.blue(`stratliveness EPOCH ${block} starting! ${nodeWallet} Pool length = [${livenessListeningPool.size}]`))
	EPOCH = block
	// clusterNodes = await getApiNodes()
	const processPool: any[] = []
	
	livenessListeningPool.forEach(async (n, key) => {
		const res = n.res
		const returnData = {
			rate: minerRate.toFixed(6),
			online: totalminerOnline,
			status: 200,
			epoch: EPOCH
		}
		processPool.push(testMinerCOnnecting(res, returnData, key, n.ipaddress))

	})

	await Promise.all(processPool)

	const wallets: string[] = []

	livenessListeningPool.forEach((value: livenessListeningPoolObj, key: string) => {
		wallets.push (value.wallet)
	})

	logger(Color.grey(`stratliveness EPOCH ${block} stoped! Pool length = [${livenessListeningPool.size}]`))
	await transferMiners()
}

export const startListeningCONET_Holesky_EPOCH_v2 = async () => {
	const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	EPOCH = await provideCONET.getBlockNumber()
	
	logger(Color.magenta(`startListeningCONET_Holesky_EPOCH_v2 [${EPOCH}] start!`))

	provideCONET.on('block', async block => {
		EPOCH = block
		return stratlivenessV2(block.toString())
	})

	await regiestMiningNode()
}


export const addIpaddressToLivenessListeningPool = (ipaddress: string, wallet: string, res: Response) => {
	const obj: livenessListeningPoolObj = {
		ipaddress, wallet, res
	}
	livenessListeningPool.set (wallet, obj)
	const returnData = {
		rate: minerRate,
		online: totalminerOnline,
		ipaddress,
		status: 200,
		epoch: EPOCH
	}
	logger (Color.cyan(` [${ipaddress}:${wallet}] Added to livenessListeningPool [${livenessListeningPool.size}]!`))
	return returnData
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
	const wallet = new ethers.Wallet(masterSetup.conetFaucetAdmin)

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
	if (!ipaddress||typeof ipaddress !== 'string') {
		return req.socket.remoteAddress
	}

	return ipaddress
}