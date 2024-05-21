
import type { TLSSocketOptions } from 'node:tls'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { homedir, platform } from 'node:os'
import { logger, getIpaddressLocaltion, regiestCloudFlare, sendCONET, getCONETConfirmations, conet_Holesky_rpc, transferCCNTP, checkSignObj, checkClaimeToeknbalance, getServerIPV4Address} from '../util/util'
import { createHash } from 'node:crypto'
import type {RequestOptions} from 'node:http'
import { request } from 'node:https'
import {v4} from 'uuid'
import {encryptWithPublicKey, createIdentity, hash, decryptWithPrivateKey, recover } from 'eth-crypto'
import type { GenerateKeyOptions, Key, PrivateKey, Message, MaybeStream, Data, DecryptMessageResult, WebStream, NodeStream } from 'openpgp'
import type {Response, Request } from 'express'
import Color from 'colors/safe'
import {ethers} from 'ethers'
import { Client, auth, types } from 'cassandra-driver'
import {transferPool, startTransfer} from '../util/transferManager'
const setup = join( homedir(),'.master.json' )

const masterSetup: ICoNET_DL_masterSetup = require ( setup )

const FaucetCount = '0.1'
const FaucetTTL = 60 * 60 * 24
const fujiCONET = `https://rpc1.openpgp.online`
const USDCNET = `https://rpc1.openpgp.online/usdc`

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

		if ( result?.rowLength > 5 && ipAddr !== '75.157.212.2') {
			logger (Color.grey(`regiestFaucet IP address [${ ipAddr }] over 10 in 24 hours! STOP!`))
			await cassClient.shutdown ()
			return resolve (false)
		}

		wallet_addr = wallet_addr.toUpperCase()

		cmd = `SELECT * from conet_faucet_wallet_addr WHERE wallet_addr = '${ wallet_addr }'`
		result = await cassClient.execute (cmd)
		
		if ( result?.rowLength > 0 && ipAddr !== '75.157.212.2') {
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

export const freeMinerManager = async (ipaddress: string, wallet: string) => {
	const cassClient = new Client (option)
	const cmd = `SELECT ipaddress from conet_free_mining WHERE ipaddress = '${ipaddress}'`
	const cmd1 = `SELECT wallet from conet_free_mining WHERE wallet = '${wallet.toLowerCase()}'`

	let idata, wdata
	try {
		[idata, wdata] = await Promise.all ([
			cassClient.execute (cmd),
			cassClient.execute (cmd1)
		])
	} catch(ex) {
		logger(ex)
		return 404
	}
	

	if (idata.rowLength) {
		if (ipaddress !== '75.157.212.2') {
			await cassClient.shutdown()
			return 401
		}
		
	}
	if (wdata.rowLength) {
		await cassClient.shutdown()
		return 402
	}

	const oo: any = await getIpaddressLocaltion ( ipaddress )
	// logger(inspect(oo, false, 3, true))
	const cmd3 = `INSERT INTO conet_free_mining (ipaddress, wallet, region, country, node_wallet) VALUES ('${ipaddress}', '${wallet.toLowerCase()}', '${oo.region}', '${oo.country}', '${nodeWallet.toLowerCase()}')`
	try {
		await cassClient.execute (cmd3)
	} catch (ex) {
		logger(ex)
	}
	await cassClient.shutdown()
	return true
	
}

export const deleteMiner = async (ipaddress: string, wallet: string) => {
	const cassClient = new Client (option)
	const cmd1 = `DELETE from conet_free_mining WHERE ipaddress = '${ipaddress}' AND wallet = '${wallet}' AND node_wallet = '${nodeWallet}'`
	await cassClient.execute (cmd1)
	await cassClient.shutdown()
	logger(Color.magenta(`deleteMiner ${ipaddress}:${wallet} success!`))
}

export const getMinerCount = async (_epoch: number) => {
	let count = 0
	const epoch = (_epoch).toString()
	
	const counts = await getEpochNodeMiners(epoch)
	clusterNodes = await getApiNodes()
	if (!counts) {
		logger(Color.red(`getMinerCount got empty array`))
		return null
	}

	if (counts.length < clusterNodes) {
		logger(Color.magenta(`getMinerCount getEpochNodeMiners [${_epoch}] data.length [${counts.length}] < clusterNodes [${clusterNodes}]`))
		return null
	}
	counts.forEach(n => {
		count += n.miner_count
	})
	return {count, counts}
	
}

const updateNodeMiners = async (epoch: string, miner_count: number, wallets: string[]) => {
	const cassClient = new Client (option)
	const cmd3 = `INSERT INTO conet_free_mining_cluster (epoch, wallet, miner_count, wallets) VALUES ('${epoch}', '${nodeWallet}', ${miner_count}, '${JSON.stringify(wallets)}')`
	try{
		await cassClient.execute (cmd3)
	} catch (ex) {
		
		logger (Color.red(`updateNodeMiners error`), ex)
	}
	await cassClient.shutdown()
}

const getEpochNodeMiners = async (epoch: string) => {
	const cassClient = new Client (option)
	const cmd3 = `SELECT * FROM conet_free_mining_cluster WHERE epoch = '${epoch}'`
	let miners
	try{
		miners = await cassClient.execute (cmd3)
	} catch (ex) {
		logger (Color.red(`getEpochNodeMiners error`), ex)
	}
	await cassClient.shutdown()
	return miners?.rows
	
}

const getNodeAllMinerWallet = async () => {
	const cassClient = new Client (option)
	const cmd = `SELECT wallet, ipaddress from conet_free_mining WHERE node_wallet = '${nodeWallet}'`
	const data = await cassClient.execute (cmd)
	await cassClient.shutdown()
	return data.rows
}

const getAllMinerIpaddress = async () => {
	const cassClient = new Client (option)
	const cmd = `SELECT ipaddress from conet_free_mining`
	const data = await cassClient.execute (cmd)
	await cassClient.shutdown()
	return data.rows
}

const cleanupNodeMainers = async () => {
	const rows = await getNodeAllMinerWallet()
	if (!rows) {
		return logger(Color.blue(`cleanupNodeMainers got zero rows!`))
	}
	rows.forEach(async n => {
		await deleteMiner(n.ipaddress, n.wallet)
	})

}

let EPOCH: number
export let totalminerOnline = 0
let minerRate = 0
let transferEposh = 0
const tokensEachEPOCH = 34.72
let clusterNodes = 4

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
				deleteMiner(ipaddress, wallet)
				logger(Color.grey (`stratliveness write Error! delete ${wallet}`))
				livenessListeningPool.delete(wallet)
			}
			return resolve (true)
		})
	}
	deleteMiner(ipaddress, wallet)
	livenessListeningPool.delete(wallet)
	logger(Color.grey (`stratliveness write Error! delete ${wallet}`))
	return resolve (true)
})

const stratliveness = async (block: number) => {
	
	
	logger(Color.grey(`stratliveness EPOCH ${block} starting! ${nodeWallet} Pool length = [${livenessListeningPool.size}]`))
	EPOCH = block
	clusterNodes = await getApiNodes()
	const processPool: any[] = []
	
	livenessListeningPool.forEach(async (n, key) => {
		const res = n.res
		const returnData = {
			rate: minerRate.toFixed(6),
			online: totalminerOnline,
			status: 200,
			epoch: transferEposh
		}
		processPool.push(testMinerCOnnecting(res, returnData, key, n.ipaddress))

	})

	await Promise.all(processPool)

	const wallets: string[] = []

	livenessListeningPool.forEach((value: livenessListeningPoolObj, key: string) => {
		wallets.push (value.wallet)
	})

	await updateNodeMiners (block.toString(), livenessListeningPool.size, wallets)
	logger(Color.grey(`stratliveness EPOCH ${block} stoped! Pool length = [${livenessListeningPool.size}]`))
	await transferMiners()
}

const transferMiners = async () => {

	
	const tryTransfer = async () => {
		if (transferEposh >= EPOCH) {
			return logger(Color.gray(`transferMiners transferEposh [${transferEposh}] === EPOCH [${EPOCH}] STOP Process!`))
		}

		const data = await getMinerCount (transferEposh+1)
		if (!data) {
			if (EPOCH - transferEposh+1 < 3 ) {
				return logger(Color.magenta(`transferMiners block [${transferEposh}] didn't ready!`))
			}
			return transferEposh++ 
		}

		minerRate = tokensEachEPOCH/data.count
		totalminerOnline = data.count
		transferEposh ++
		const index = data.counts.findIndex(n => n.wallet === nodeWallet)
		if (index < 0) {
			logger(inspect(data.counts, false, 3, true))
			return logger(Color.red(`transferMiners row data error!`))

		}
		const localData = data.counts[index]
		const paymentWallet: string[] = JSON.parse(localData.wallets)
		if (paymentWallet.length > 0) {
			// transferCCNTP(paymentWallet, minerRate.toFixed(8), () => {
			// 	tryTransfer()
			// })

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

export const startListeningCONET_Holesky_EPOCH = async () => {
	const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	EPOCH = await provideCONET.getBlockNumber()
	transferEposh = EPOCH + 5
	await cleanupNodeMainers()
	logger(Color.magenta(`startListeningCONET_Holesky_EPOCH [${EPOCH}] start!`))
	provideCONET.on('block', async block => {
		if (block <= EPOCH) {
			return logger(Color.red(`startListeningCONET_Holesky_EPOCH got Event ${block} < EPOCH ${EPOCH} Error! STOP!`))
		}
		return stratliveness(block.toString())
	})
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
	logger (Color.cyan(` [${ipaddress}:${wallet}] Added to livenessListeningPool!`))
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

export const getApiNodes: () => Promise<number> = async () => new Promise(async resolve=> {

	const cassClient = new Client (option)
	const cmd = `SELECT ipaddress from conet_api_node`

	try {
		const uu = await cassClient.execute (cmd)
		await cassClient.shutdown()
		return resolve(uu.rows.length)
	} catch(ex) {
		await cassClient.shutdown()
		return resolve (6)
	}
})


export const regiestApiNode1: () => Promise<boolean> = async () => new Promise(async resolve=> {

	const cassClient = new Client (option)
	const ipaddress = getServerIPV4Address(false)
	const cmd1 = `INSERT INTO conet_api_node (wallet, ipaddress) VALUES ('${masterSetup.conetFaucetAdmin}', '${ipaddress[0]}')`
	try {
		cassClient.execute (cmd1)
		await cassClient.shutdown()
		return resolve(true)
	} catch(ex) {
		await cassClient.shutdown()
		return resolve (false)
	}
})


export const storeLeaderboardFree_referrals = async (epoch: string, free_referrals: string, free_cntp: string, free_referrals_rate_list: string) => {
	const cassClient = new Client (option)

	const cmd1 = `INSERT INTO conet_leaderboard (conet, epoch, free_referrals, free_cntp, free_referrals_rate_list)  VALUES (` +
		`'conet', '${epoch}', '${free_referrals}','${free_cntp}', '${free_referrals_rate_list}')`
		try {
			cassClient.execute (cmd1)
			await cassClient.shutdown()
			return true
		} catch(ex) {
			await cassClient.shutdown()
			return false
		}
}

export const selectLeaderboard = async () => {
	const cmd1 = `SELECT * from conet_leaderboard`
	const cassClient = new Client (option)
	try {
		const kk = await cassClient.execute (cmd1)
		await cassClient.shutdown()
		logger(inspect(kk.rows, false, 3, true))
		const result = kk.rows.filter(n => n.free_cntp && n.free_referrals)[0]
		
		const ret = {
			epoch: result.epoch,
			free_cntp: JSON.parse(result.free_cntp),
			free_referrals: JSON.parse(result.free_referrals),
			guardians_cntp: JSON.parse(result.guardians_cntp),
			guardians_referrals: JSON.parse(result.guardians_referrals),
			free_referrals_rate_list: JSON.parse(result.free_referrals_rate_list),
			guardians_referrals_rate_list: JSON.parse(result.guardians_referrals_rate_list),
		}
		return ret
		
	} catch(ex) {
		await cassClient.shutdown()
		return null
	}
}


const selectLeaderboardEpoch = async (epoch: string) => {
	const cmd1 = `SELECT * from conet_leaderboard WHERE conet = 'conet' AND epoch = '${epoch}' `
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

const testInsert = async () => {
	const cmd = `INSERT INTO conet_leaderboard (conet, epoch, free_referrals, free_cntp, free_referrals_rate_list)  VALUES ('conet', '573043', '[{"wallet":"0x93496109f28ede542be55244beaf5e91ca2b93e6","cntpRate":"0.016336006789730482","referrals":"235"},{"wallet":"0x1a17b6d55bd8d9b054333dd1fa26b96f77c6ab06","cntpRate":"0.008453469127943967","referrals":"211"},{"wallet":"0x8337ba4d0c2254c325162bce8b2b65788efd9657","cntpRate":"0.00480687460216422","referrals":"55"},{"wallet":"0x8e77ec636b233cfadbefaada5cdeef53cb1ddda8","cntpRate":"0.001896965839168257","referrals":"33"},{"wallet":"0x1cbcd8365ee741456899a1e3f686b695a32f33db","cntpRate":"0.001952217271377043","referrals":"32"},{"wallet":"0xe52e3d194949763f36d0de2c2d16580848e04b25","cntpRate":"0.001804880118820287","referrals":"32"},{"wallet":"0x3e69eb520e6a7acd4241d4b0064fce7f59be4185","cntpRate":"0.001878548695098666","referrals":"32"},{"wallet":"0x179b2db1462ff1e17df17d59d9772e8909e21209","cntpRate":"0.001896965839168259","referrals":"31"},{"wallet":"0x91c5a930533012226065d846174491a2b47e3c56","cntpRate":"0.002854657330787184","referrals":"31"},{"wallet":"0x935551285f1eda0cabfd5156f3045dde3978d048","cntpRate":"0.001141862932314873","referrals":"30"}]','[{"wallet":"0x93496109f28ede542be55244beaf5e91ca2b93e6","cntpRate":"0.016336006789730482","referrals":"235"},{"wallet":"0x1a17b6d55bd8d9b054333dd1fa26b96f77c6ab06","cntpRate":"0.008453469127943967","referrals":"211"},{"wallet":"0x8337ba4d0c2254c325162bce8b2b65788efd9657","cntpRate":"0.00480687460216422","referrals":"55"},{"wallet":"0x91c5a930533012226065d846174491a2b47e3c56","cntpRate":"0.002854657330787184","referrals":"31"},{"wallet":"0xc8240f4c920399cf92ab241c7c38f93b0e447325","cntpRate":"0.002578400169743263","referrals":"28"},{"wallet":"0xb90bf6c68f1b416ace84b76de77b9955762a6c00","cntpRate":"0.002210057288351368","referrals":"26"},{"wallet":"0xfc5c360afaa398acbc5d3a04c514635d6a9c0e40","cntpRate":"0.002210057288351368","referrals":"24"},{"wallet":"0x1cbcd8365ee741456899a1e3f686b695a32f33db","cntpRate":"0.001952217271377043","referrals":"32"},{"wallet":"0x179b2db1462ff1e17df17d59d9772e8909e21209","cntpRate":"0.001896965839168259","referrals":"31"},{"wallet":"0x8e77ec636b233cfadbefaada5cdeef53cb1ddda8","cntpRate":"0.001896965839168257","referrals":"33"}]', '[{"wallet":"0x93496109f28ede542be55244beaf5e91ca2b93e6","cntpRate":"0.016336006789730482","referrals":"235"},{"wallet":"0x1a17b6d55bd8d9b054333dd1fa26b96f77c6ab06","cntpRate":"0.008453469127943967","referrals":"211"},{"wallet":"0x7b177f41334a012ba438bdb5d6acaa482a234bea","cntpRate":"0.000994525779758116","referrals":"12"},{"wallet":"0x561e9a11b3d11d237e2fd8ddd29926ae97933aa7","cntpRate":"0.000147337152556758","referrals":"2"},{"wallet":"0x8fcb191a4e40d0afa37b2fa610377688992f057f","cntpRate":"0.000368342881391895","referrals":"6"},{"wallet":"0xd8b12054612119e9e45d5deef40edca38d54d3b5","cntpRate":"0.000423594313600679","referrals":"7"},{"wallet":"0xb561cb4904c119a4068828fa4a161646be13955b","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xb19e7634f2bc7121ae2cc8cd2d548212d3cd4726","cntpRate":"0.001547040101845959","referrals":"26"},{"wallet":"0x343435d429cf24c22289910bc8489a868dad3d89","cntpRate":"0.000368342881391895","referrals":"4"},{"wallet":"0xb90bf6c68f1b416ace84b76de77b9955762a6c00","cntpRate":"0.002210057288351368","referrals":"26"},{"wallet":"0x691a2efba47410474009cfa48e21130c106461ed","cntpRate":"0.001252365796732444","referrals":"26"},{"wallet":"0x8c00999b668d0efb05defb7be33e86e8dffb35b1","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x935551285f1eda0cabfd5156f3045dde3978d048","cntpRate":"0.001141862932314873","referrals":"30"},{"wallet":"0xff5d1465b38799ec0c5ca0b1272ba24c733d42f8","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x6b5510cbe1577436606330f1d3dd658a89f526f6","cntpRate":"0.000939274347549332","referrals":"11"},{"wallet":"0x179b2db1462ff1e17df17d59d9772e8909e21209","cntpRate":"0.001896965839168259","referrals":"31"},{"wallet":"0x8337ba4d0c2254c325162bce8b2b65788efd9657","cntpRate":"0.00480687460216422","referrals":"55"},{"wallet":"0xe40e5993c1d995a835d0f8f3ac06775d08c8d573","cntpRate":"0.000184171440695947","referrals":"2"},{"wallet":"0x96ed08112c8dfc224fdb44a7a1cf9cd64984bd2c","cntpRate":"0.000460428601739868","referrals":"5"},{"wallet":"0x5bdae43d32c560236595d7953bd23bbdcf760f2e","cntpRate":"0.001473371525567579","referrals":"18"},{"wallet":"0x0c70c5af8ea1065f6275c0a17e0ef9a45023e846","cntpRate":"0.0006998514746446","referrals":"8"},{"wallet":"0x48a7f7ab0e3e9524f23945639035bbc076cc93bc","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x0e6f883dfa519e0da29eaf1415df94935fa02dec","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0xfc535e7b7a5b941c45556e5d863190e659c6875b","cntpRate":"0.001031360067897305","referrals":"12"},{"wallet":"0x2f52f7a9ea3601d526d2960e3dba51fef2e49691","cntpRate":"0.001583874389985148","referrals":"22"},{"wallet":"0x18f7d879da877bb2c3b4184cae74fef28b321a10","cntpRate":"0.001031360067897305","referrals":"12"},{"wallet":"0xe9bd7d7ab3defecc92998f70669bc427c7c45945","cntpRate":"0.000681434330575006","referrals":"13"},{"wallet":"0x11610ef4204c07bb73d25ca057fbc80062efdf46","cntpRate":"0.000239422872904732","referrals":"3"},{"wallet":"0xe8e2290659befc3e9e0fb853a26fac7e8ab80393","cntpRate":"0.000128920008487163","referrals":"3"},{"wallet":"0x928c4e141a72669718b108f6d63350699d2f1f24","cntpRate":"0.000644600042435816","referrals":"9"},{"wallet":"0xb6fc688af8d2f2913101eef4557dbd8b3f3ea9fc","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xcfc62605e1a03d30e18cd6bfe288b963258a428f","cntpRate":"0.000276257161043921","referrals":"3"},{"wallet":"0xc63998b0b4a6316f4fd913986e3482925f8004a9","cntpRate":"0.000920857203479737","referrals":"10"},{"wallet":"0xcf6ad29f268f4b62a0c2d0cb9816d46e4a0f1f94","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x8e77ec636b233cfadbefaada5cdeef53cb1ddda8","cntpRate":"0.001896965839168257","referrals":"33"},{"wallet":"0x1cbcd8365ee741456899a1e3f686b695a32f33db","cntpRate":"0.001952217271377043","referrals":"32"},{"wallet":"0x173a3b0993a2dc8ebd833ee54307bceca5807965","cntpRate":"0.000902440059410142","referrals":"13"},{"wallet":"0xbcce18c60de3827777f6b11d9027b0b1c7e1abfd","cntpRate":"0.000184171440695947","referrals":"2"},{"wallet":"0x79166a9962a0dd0595f01454964c0ffeb833cef8","cntpRate":"0.000202588584765542","referrals":"3"},{"wallet":"0x0d4192791ca4828f3920c57d507f9d6c56ceb333","cntpRate":"0.000828771483131763","referrals":"9"},{"wallet":"0xe91e79a02314e1aaebd6cbcd7dd570a7a846c11a","cntpRate":"0.000589348610227032","referrals":"10"},{"wallet":"0x08651265e0c11dfd848ceed25827a1fb7602da5a","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xd3bee59bef2607e7c973f8612e6e49a546b4f451","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x7ad6bb23e593322d1bf5aba6fb6ded16ff1d14ff","cntpRate":"0.000773520050922979","referrals":"16"},{"wallet":"0xc84284160b53cfc74e79c12064a078c40f56b03c","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xffddd685ece0a19147eb8ee23c3211d38b0d44bb","cntpRate":"0.000147337152556758","referrals":"2"},{"wallet":"0xd157fce5da6ec0be1f568c8cd85f73be8ebab490","cntpRate":"0.000184171440695947","referrals":"2"},{"wallet":"0x91c5a930533012226065d846174491a2b47e3c56","cntpRate":"0.002854657330787184","referrals":"31"},{"wallet":"0xe52e3d194949763f36d0de2c2d16580848e04b25","cntpRate":"0.001804880118820287","referrals":"32"},{"wallet":"0x141276f0a3cb42e96f3ea4218110e72935128769","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x61e7f902dd9d301dbd74e2793d47b6358eb7a357","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0x09c0a900348cc63f01b4fff87c5bcde8967ddd7e","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x426fecbebf5c94cb611bd2ac46044d205994de06","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xcc25398236b8be5fdbd6cfb9248e7345c1d2f21b","cntpRate":"0.000184171440695947","referrals":"2"},{"wallet":"0x4a104ed7f8bc32e8a400258a46e164d75132e749","cntpRate":"0.000202588584765542","referrals":"3"},{"wallet":"0xb886022a8ecba5ac09186eedf331e8e677491113","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x71621ff8940a0b24e4e55330c538433b5bd47d7a","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x3e69eb520e6a7acd4241d4b0064fce7f59be4185","cntpRate":"0.001878548695098666","referrals":"32"},{"wallet":"0x00dd2a93c30fefc048fa2e322627821e42214cf7","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xd64da78e82def1ee2db0b4dbe7f57fe9e42c5725","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0xfc5c360afaa398acbc5d3a04c514635d6a9c0e40","cntpRate":"0.002210057288351368","referrals":"24"},{"wallet":"0xca10beb7692fb90c86a3b113489ddd985a6a7046","cntpRate":"0.000497262889879058","referrals":"7"},{"wallet":"0xa4447046c1de17ca82547c3b312d1235adc6cce1","cntpRate":"0.000184171440695947","referrals":"2"},{"wallet":"0xfb8df4964d49c8ded1c34e90cbed41432ac5b4bc","cntpRate":"0.000257840016974326","referrals":"4"},{"wallet":"0x10aa25b290b74881a122d0168e1794ddd62956d5","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x860a54eb99a29ecaa9478f71d94cb4e32ceb4c33","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x6034330e515565ac582e1c2a8e2acdbee19a6b26","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0xaefb1b652a0df4297d279c73b0fa6561efde07af","cntpRate":"0.000442011457670274","referrals":"8"},{"wallet":"0x5097e278c7c5063a09ec6477b3895506ef2661c0","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xd982c2e5194e5350a8e3cc2fd050d462c09c717d","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x7a23574af7167dc32160b8e324779f8db4a17fab","cntpRate":"0.000147337152556758","referrals":"2"},{"wallet":"0x2492e8a072325efa1a586b74a57ad600007df790","cntpRate":"0.000276257161043921","referrals":"3"},{"wallet":"0xb54dd8f0247eac42d0ca79b90ed4a8364b52ecad","cntpRate":"0.00038676002546149","referrals":"7"},{"wallet":"0x333bea69fff24f1a76bbb12050fefc7eb0d24dc3","cntpRate":"0.000147337152556758","referrals":"6"},{"wallet":"0x7759f135752efd3172b984c357ca76224d3ae7a6","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xaee3231522bee10b4cc634c0d8446db3513e4232","cntpRate":"0.000147337152556758","referrals":"2"},{"wallet":"0xc2db17cc214c7946fc226cfd254be0c6790fadf0","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x2cb4c20e9f191272ccf392daab769134be91ea16","cntpRate":"0.000405177169531084","referrals":"6"},{"wallet":"0xc8240f4c920399cf92ab241c7c38f93b0e447325","cntpRate":"0.002578400169743263","referrals":"28"},{"wallet":"0x31d754213b461f5f63650fe3d8eab9aae94454a6","cntpRate":"0.000276257161043921","referrals":"3"},{"wallet":"0x5b0214c7067804cafa0d4af67ec66ec6ac2b9bb0","cntpRate":"0.000165754296626353","referrals":"3"},{"wallet":"0x61b473d2537958f887325064cdecf51ccf0d596a","cntpRate":"0.000055251432208784","referrals":"3"},{"wallet":"0xc2e2fa9ba0756938926f3fcb9654cc03bb737098","cntpRate":"0.000386760025461489","referrals":"5"},{"wallet":"0x8b58c393eef008c94232d694528279b9216313ac","cntpRate":"0.000276257161043921","referrals":"3"},{"wallet":"0x8f0254c4b45055a53cb263d3a079975878547c8a","cntpRate":"0.000147337152556758","referrals":"2"},{"wallet":"0x19e33cc78bb60f99d75d89f60999dd3752aa2be8","cntpRate":"0.000184171440695947","referrals":"2"},{"wallet":"0x4f6955804a5450b6546880f59ccfed58ef8b26c3","cntpRate":"0.000497262889879058","referrals":"7"},{"wallet":"0x1bb8cbddc77dff51f97caa6a64a0811d4409225d","cntpRate":"0.000294674305113516","referrals":"8"},{"wallet":"0x5dcfd43a61338bd998e334c023ba9f3464ea92f4","cntpRate":"0.000460428601739868","referrals":"5"},{"wallet":"0x78b6df78d9090966c768da42ba239b596bd5c198","cntpRate":"0.000515680033948653","referrals":"10"},{"wallet":"0x08dd36712ed642edda1a9c5fb9a541a5528bc381","cntpRate":"0.000552514322087842","referrals":"6"},{"wallet":"0x41e411fc00cd063bec64d516260ce07fae19f1af","cntpRate":"0.000331508593252706","referrals":"6"},{"wallet":"0xef5a156b21aab0066d593987a411d7619da05efa","cntpRate":"0.000110502864417569","referrals":"6"},{"wallet":"0x8e27766abb6a699029960969be3d1f27f3c6c7d3","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xacf2b8463f10c0edc0783376f16ae55d99edf3f6","cntpRate":"0.000147337152556758","referrals":"2"},{"wallet":"0x6ffa98f050261a9e176cd59c6db15260dd1c8c15","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x61813a6fb3a84ab3d3bd641096b768704833d334","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x6e05d056db5588a41081f9d93fd524b5d4fc329a","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xb8da4d8abd48663c59a69983b3a21e4aa3fecfba","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0x09003213a34811c13699f44f974b45dedb9eeeff","cntpRate":"0.000018417144069595","referrals":"1"},{"wallet":"0x1932b04abb76ac3b2d12b8b31b4e0c5a656142be","cntpRate":"0.000368342881391895","referrals":"4"},{"wallet":"0xd83bec6ca0f77393c449a5afba5baf9f124f7f8a","cntpRate":"0.000313091449183111","referrals":"5"},{"wallet":"0x26deb548c9e76d94a7c0e686b57483090e518b1f","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x25d6d64a9dd0c524e1f15f4acb5842ba994e3264","cntpRate":"0.000331508593252705","referrals":"4"},{"wallet":"0xa289a0e3883ad27ce095c606a3db9f8990dd3bee","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xda4412f74eb1c8886f6e04ea03dce6c206e61f7a","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0xc8782fdb328f3e42f667c58e21ef7240b7de4491","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x7644865a46b2c7381b2ca136926f1dda184eb93f","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0xa49921cb4e216c16a8293c4c8e14a25ffed9b852","cntpRate":"0.000313091449183111","referrals":"5"},{"wallet":"0x9e88af197c120bee8258ef2a79b0b0d8af2334fa","cntpRate":"0.000147337152556758","referrals":"2"},{"wallet":"0x8903dcafb0ee0dfe825653982947d9b671d321ef","cntpRate":"0.000128920008487163","referrals":"3"},{"wallet":"0x6b54acc4249eb688edc718aadff6e6967d428d15","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0xc61bc33f8b516ffe1f60d8384f75774ac563ea6f","cntpRate":"0.000018417144069595","referrals":"1"},{"wallet":"0x4d0da16636b3d0410881fe5d34e1c1fd4058ff7a","cntpRate":"0.000423594313600679","referrals":"9"},{"wallet":"0x40e204b601816fde6713252cceb7a0eea15d5c27","cntpRate":"0.000128920008487163","referrals":"7"},{"wallet":"0x1c58f8d04e57d316b8bee36d9088247ce24d7713","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x496ae1703eb1d2d6c2644aeb26e45f236bfd645d","cntpRate":"0.000184171440695947","referrals":"2"},{"wallet":"0x0f24defb1349164b006f07e96937ce8333949c61","cntpRate":"0.000368342881391895","referrals":"4"},{"wallet":"0x412c417e8241018b129235862a41281235ab7d72","cntpRate":"0.000221005728835137","referrals":"4"},{"wallet":"0x81bbedcdc4086cf25363b15b5b4a8b7deae40651","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xce237971ea7e561c8cd54f006d0744a111f83d8e","cntpRate":"0.000405177169531084","referrals":"6"},{"wallet":"0xf18a90d922046db2378b14aa404262e9588ec2fc","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x24e727585e808e87bcef07aea177b37d383a128f","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x727096c6a6d099bd639d49df9b1e96ce5ca548c8","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0xc1d9b8992c30dc47f5fd374fe73369733ce20cf4","cntpRate":"0.000018417144069595","referrals":"1"},{"wallet":"0x0a522836ae74717db7b58492940d6ee1d6a79915","cntpRate":"0.001178697220454063","referrals":"14"},{"wallet":"0x3de04198debc46653f7a770ec0101dcf65b60976","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xe3c129dae47303dec57e6043be8691a69d3ad580","cntpRate":"0.000147337152556758","referrals":"2"},{"wallet":"0x2b0ed0d28cf2ad24b23ba4189b29d3790b688f0d","cntpRate":"0.000239422872904732","referrals":"3"},{"wallet":"0x59dd46a36d109cde3dc86a4f4f8ed0511bfc7093","cntpRate":"0.000552514322087842","referrals":"6"},{"wallet":"0xc46f7ccb020711e4c037df9787bc6c4fb7257f85","cntpRate":"0.000331508593252706","referrals":"6"},{"wallet":"0x1e26ba538afc97c6d8c49d8f7f630d3a59080cc8","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x046ab07c83e84894344fbf1563bd27871ed3d16e","cntpRate":"0.000073668576278379","referrals":"4"},{"wallet":"0xc845f3e79dc6f072b87091cc30615bb5c1f65b14","cntpRate":"0.000239422872904732","referrals":"3"},{"wallet":"0xfd3f376277ada306e37714e7f890fa2b469b62b9","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x135b7fcbfca42ca9783717f93665dd92884c84dd","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xe0de65ac2bb510540e54bc79d484c7da14bf3949","cntpRate":"0.000184171440695947","referrals":"2"},{"wallet":"0x63eddaf55b08bb9bddbb64aa45aae76f3eb032a6","cntpRate":"0.000184171440695947","referrals":"2"},{"wallet":"0x600b54eb110202358704bf005b45e1ebad93346b","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x0f6d8fc7a828da7009d8a979a87020c9c213e27a","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x2e831213c1d46aba0b70a07b3204f04d1c83f68d","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x20a35f6de1ef795fa0834ed153886227afb8372d","cntpRate":"0.000147337152556758","referrals":"2"},{"wallet":"0x983db827612f4ea55ad5b136f1f80a6353e6b943","cntpRate":"0.0003499257373223","referrals":"5"},{"wallet":"0x1d24bfc626880bd8ec5b41974541ed2642e10fde","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x1f384ba298ae94d492f48dbe6fead38a48ad59eb","cntpRate":"0.000184171440695947","referrals":"2"},{"wallet":"0x891b44402f1d7a046b9f05bc82641d071ef51294","cntpRate":"0.000110502864417568","referrals":"2"},{"wallet":"0x8ad17a0e7f2725b7a073e5d4e1f053e9d53041fd","cntpRate":"0.000147337152556758","referrals":"2"},{"wallet":"0x848b08302bf95de9a1bf6be988c9d9ef5616c4ef","cntpRate":"0.000073668576278379","referrals":"2"},{"wallet":"0x5e0e4a8e9add25141b8d47d61466d1b5d418d250","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x3788a01ea79e7c33b6224421bb7db3cbb0d9485e","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x2bd91a61ebfc3cd6d749d0702eb5f248f6490fe9","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0xd828f0bd518bf10420511608f6e08e55818632fa","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x9a56fe8a8ac42ae02a2b549e86ffdcc6efaa0a92","cntpRate":"0.000110502864417569","referrals":"2"},{"wallet":"0xae0e19b34ab12bc3b043028ef1a7a8fe0b32d03f","cntpRate":"0.000331508593252705","referrals":"4"},{"wallet":"0x20210fb4b3453b362f62b3af68722fcc4c31cf72","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x21fcec3f79a15af87f01bfd5df7b2480e33d9d4e","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x683f001e9d7fccbbf3b5a8557cf7738a99b3dd34","cntpRate":"0.000276257161043921","referrals":"3"},{"wallet":"0x8ab7b4bfe50738a8793735e7eb6948a0c7bac9ee","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x550ca3f1f74d6c723c9cd90d3d436b08d4ccc195","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x2ca6b7ffde62ccf89dc25d4128838f489fb51a15","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x69529b9b847c2cbd194d0f54b52e883a41489e2f","cntpRate":"0.000184171440695947","referrals":"2"},{"wallet":"0x8a7c05ecfcc8c16e5ea917a42eec3b575cb64efd","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xe601e6caf2da9791ab19610ae51c33af35bbc0c4","cntpRate":"0.000276257161043921","referrals":"3"},{"wallet":"0x2e5dd090d2b61da2afd93b60f08fa5615786d88b","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x83c92b1094fc1876ffac4422f49c0125aae29a91","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x4da246c3157090a2a72ecd8282cecfa503d28459","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x9bacbea62d567027dbd572744525e877d15ef938","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xa300b8d8f85de4d02c0565a57adb0870adecc2d0","cntpRate":"0.000239422872904732","referrals":"3"},{"wallet":"0xea920f082ec984f0c65b7889cefc274a6d452fcc","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x53fc5c49728ffbbf0403217fe50e94a07b7c8f4d","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xc3b9c2143bed9ca0b7698e9b9c61babe7e6b8cd6","cntpRate":"0.0003499257373223","referrals":"5"},{"wallet":"0x64aaca09d30ee35d995109addb04e3605e0ecf5f","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x211c7cf7191f3d5da0e577a8dc1491281c89f2a5","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xfcb65f62307e0b877cd40f46ffebc029fd654dc2","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xe18546a308cd319e71301d11e5be4e5690436503","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0xe449d0cb3481f08a31b6dd00122e99f88d6a829a","cntpRate":"0.000184171440695947","referrals":"2"},{"wallet":"0x217f29198b9e0558e11815555872dd0893b665b4","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xcb16f5d5638c4f7f4699b71317f76f1636f82896","cntpRate":"0.000184171440695947","referrals":"2"},{"wallet":"0xad0dcdd891147e62415fe29b5875e16a2981750f","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xe548c36d9f82e81fe7032f1ea8610d60a677a371","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x15dc5f0bdb756f93b253a7b7b9bb373711223312","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x3f24c25e00a1fcade584c8199cd09614862c5531","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0x4a2ed3cb5345620d2054c48509f0499131481b3d","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x815e004e93fda40a25105074a0ced9547710140f","cntpRate":"0.000147337152556758","referrals":"2"},{"wallet":"0x8ca8953cdf4fa3f88c89af8e4f602d920247f1b1","cntpRate":"0.000147337152556758","referrals":"2"},{"wallet":"0xa3eee649d24f7411596909409c1e2219e007a621","cntpRate":"0.000184171440695947","referrals":"2"},{"wallet":"0x61d4e671136cc7d29925ccab751b06e7ad0270cc","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x737b4d14c44481e52c573afed826e0952d2655ca","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0x42388bb6824bf8ac828e255a9d8d5ebdadcf9254","cntpRate":"0.000184171440695947","referrals":"2"},{"wallet":"0xefd4af83a7f38628c82009f972ef3737925c15c7","cntpRate":"0.000202588584765542","referrals":"3"},{"wallet":"0x3526cf3a63483356e16bb39a93d97c65aca257b9","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xcb404c2a1eaba2743c5f672d32b0e34f587a3a21","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x96fb2a33626c1f048c5f928709b4f8be28460a5a","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x2cc1bcec445ac57e3085f86fbe360b6315ecaaa9","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x72cccaa55caee5d9165e224823dcc7518e775548","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0xe14c23f69b60a88b665d5e05508bb9cf9988723e","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x47d83e472e04756672b4f95f34ca4e053023a2cc","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0x7c1da52de07b366c58e5c0e35723ae05edddca90","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x8e1a383c7246614755d1d87a7a40f033d418581a","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xe73d5234c3663e6acd492370aca822e60079fe54","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x81ae27c67c08c53b4399e68e45ffc29aa8ff0fcf","cntpRate":"0.000147337152556758","referrals":"2"},{"wallet":"0xd6924a97fa81a0a0598c1c3641a26409166b3572","cntpRate":"0.000165754296626353","referrals":"3"},{"wallet":"0x1bf5738bb819c366756fcdab122bf92ae44713b3","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x07e122a1ec5edc1879182623a563dbe2c73bfd6c","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x026155d2d0c97bb7181f9eb95cbce6c6440128d8","cntpRate":"0.000184171440695947","referrals":"2"},{"wallet":"0x387898d9eec7eff12ace847a1c5a466ec7c97b12","cntpRate":"0.000202588584765542","referrals":"3"},{"wallet":"0xa0c9cd8fc1c6969a9e5ff344af2dbfe3774538be","cntpRate":"0.000184171440695947","referrals":"4"},{"wallet":"0xda5b2e57b8b71bfbb5fdcd4569ab679bd5900290","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x03ca50255b2746297d8c773e209220cc45ae645e","cntpRate":"0.000184171440695947","referrals":"2"},{"wallet":"0x6e076e623bf2de53b5e75b27099fecf4d468fa7a","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x5e36de5c8b70b40a692d7e6843c81d789f287c96","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xf2e2412d1eb9dd02aa3133257434cdefe4509ce9","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x168e982acb6cac22c39d0620310c5d422b007d1b","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xb698b9024b11c7735d7ccb0f4bccbdd502633db1","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0x17a0f85a604808162a07298a108527a6adb1a0c0","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x266b67025d0b6b440c2151daab62b7cc2ac3578d","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x421abdad36e6fe528d53c55c5f30a1413e6959c6","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0x51d13ff4dc5557d9ea6bb0155e65a0d385c8e3ef","cntpRate":"0.000018417144069595","referrals":"1"},{"wallet":"0xd363c6a3f9b26eaacfbbe718f8ef3b3fd5bb12a4","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x7b49f6ea79e5a1a21a0f0de071b4362dd88b4610","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xdcb1b31af9e31b0f0d38f1106d8b8bab5fd10eff","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xab5f6f681ca8201640ed77534f762e838c004844","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x985800fd0de9b965e0a43cda0f6a97f8811ef748","cntpRate":"0.000184171440695947","referrals":"2"},{"wallet":"0xcc565874638839a55037f41e1eb9ed9ba30ebffe","cntpRate":"0.000276257161043921","referrals":"3"},{"wallet":"0x8cb906a4d27f022eb9b94d1224c153cd7a0a0e88","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x9d1212fee927f1cbc174bd8bf3f57a822af04a20","cntpRate":"0.000184171440695947","referrals":"2"},{"wallet":"0xec61c953872cc4f78abf9ca91d12f549dc188491","cntpRate":"0.000110502864417569","referrals":"2"},{"wallet":"0xb8e8b8c42b4641bbbb2dd325bbcf5d4dbadc1fc0","cntpRate":"0.000128920008487163","referrals":"3"},{"wallet":"0x82d83e62ca442be4dff41539f869f0738d7e506b","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x49d30c6444122ba6106f8aa38b717cd94b4fa589","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x4e9e0d3dfac7431f4723eb50b34e05a7a4e97b47","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x1edf79c89b2f22d24fc015adede3d66e6a9029a4","cntpRate":"0.000147337152556758","referrals":"2"},{"wallet":"0x5ae58c499adfe39e7fd82eab2231c9d7b055483e","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x41c2c3d654f659a262088aca7079bdc05e2a0061","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x9a3625ba82b8fc32270a059657c48a5994460186","cntpRate":"0.000184171440695947","referrals":"2"},{"wallet":"0x6fded054dce05c69689d3c10ef1d5f3d524a6605","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xecdef5e4a061a110728e01bceb0ca0908d80b9f1","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xf2589e879f9d3afafb28c22b44a1d97836531431","cntpRate":"0.000184171440695947","referrals":"2"},{"wallet":"0x2273b262c8f55dbdd023c2616cfc1f6c8a22e751","cntpRate":"0.000202588584765542","referrals":"3"},{"wallet":"0xbf4ce831a8f1c30174618ab6c98541a3e56bf198","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x13e8f80a96dd2044cfc10e6cbade549f30776bcb","cntpRate":"0.000184171440695947","referrals":"2"},{"wallet":"0xfc245251518db7bc0c6bf8953575b4cc7d6891d3","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xdba3535285a4bae5a6a94f5c6a54931f4e0c6982","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x429a6207fce215c9253670905aa533dba197c908","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x98f381095d9b3a7beb40f6a2d1d639e8ca909915","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0x013e77a005da593c146299db6625153815e92926","cntpRate":"0.000165754296626353","referrals":"3"},{"wallet":"0xa12941d8c6fc3edbfa9422fbd7a1f2bb80be1bfd","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x8248d912c3ce688e1121d89bee1044bc7fae1d79","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x4b7572579a864e848ee4a2eacc107d17c4b3bf3c","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x32441f5378047584810f1de50abf3b871c8622dd","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x1ab03b1e9ee0da7a71b370e2acacc5968a337975","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xec840cc58d178de057cb5685090b1861760106c2","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xbfe67298fbce41535f2cab2537bd5bea9162d977","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xc1d6e3fb5670cf1669e730bea2e7cf962d46deff","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x2be96f397bb51679788c332685ab24769017bbc6","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0x18e976929b107028f03a3134a87a87b3c1d3f415","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xf286240abad5fd0bc8a845ead8e5cfea58482f3c","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x8369a17ab21d8fb4f15da867d91ab277b842a1cb","cntpRate":"0.000276257161043921","referrals":"3"},{"wallet":"0x269d80d77bfdc8278b513754699185cbc02e7a1f","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xf214206fbfe7e4a743d739982a6d1bc1b73931c6","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x543eedb4c191aa2a66575638956ef6295d576a9d","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x4979815571beb90e960d4e3cce4e6885121052df","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x76ae78300a09bf5f86daa0e809c3994b940e0c18","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xd9bb9a66739f5cee7043bb4662e8a5667df4c66e","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0x33346288ee8cc1524e4e3ab730d4ad776fa29276","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x20703bf11e08f514f522a0f33365a833045cf381","cntpRate":"0.000073668576278379","referrals":"2"},{"wallet":"0x096e67e495da623976f12f3b775727fdf7193e5f","cntpRate":"0.000018417144069595","referrals":"1"},{"wallet":"0x118be8014abe52cc4e92ceb9db03da2e80d72a38","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xd4de9da82b409b606789c8339dd4c324a0eb70e8","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x0c263b8f54b2d19827cc74e57ceaca642385d835","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0x2fd0677d6b41119b6fcc0e88e70192843619be99","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xdcab5f9c9c4ed4c79052f6a61add5f684c229b48","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xac64d4c77bb798a0ac65ccd02e574645dddf2635","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x51c242b59db94665b2eae4ce09d3a0be7380d89e","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x5ab500f40a5603413e6f673370cd3ef9ef522a74","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x0dc8c4216db8f3af653db450872a2f1beaac032f","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xbe089f9b246f31897ce6c9ef15171887549893be","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x090f667bfda298091c4cefcc53742dbb9109d1e0","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xaee954556407de8831459f609681e9922020a1f6","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x11434a5609ff28d013b4debc03fc8fb53f049e55","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x5ec6e9bd54cd3a4ca6b4e8ae9ffdfacc01215d19","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0x3faf0069e1b659858e88f9fbe8c08a416c0aafb5","cntpRate":"0.000018417144069595","referrals":"1"},{"wallet":"0x8d4406fd35640af5567467e3ca6699a421d351e8","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xb4b52089ad4b402f2943d04e1737bdf185505023","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x8c6a80686ce52b256f72930a423beeb97d4cdbc3","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x3d09621bb919044dae41bf1790e14e44339629ae","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xde54304bf2713b67368e5de9fc9812d6f1ac83db","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x5bc3fe542064ec59f68cd35317529a2bb22c9d93","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x71cf0ae002c36a9fb7abfe0788a3748e15693c40","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x5f21b43844f01b2098807f66956775188481388c","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x65dd57893756bca1c029342c1792f40b4f82d5ae","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x9cfa4abe1abf16b3597b910bdab16513cfaf759d","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0x761a333b0f63b3f5428e69269a43ce8e69d77966","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xe9acda705ac7a222eee0bef547f12aaf83e08844","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xd0906ae84dbdb3306874b47f57d782a20c5e6c1c","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0x23e36d054ac11b526602ec5fb0dcf966ac97631b","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x8dd0f0db31045b3b8d4cf0b9a7efb7984707a321","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x6adf073aad370d954bbe80f9bba851e9b9fcc7ec","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xfb0467152527e766565eef67c8f746e2220bfeeb","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0xc76afe7f04340664bb047f3bb9ca76487b9841e7","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0xc45cbd2a66f7a252a35bbdb7e8d6422f9e71f2ea","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x35b651e6c29329aafdeb961ff1929f133c971e14","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0xa54c5badca72eeabc8c54810cdc3b5380a48b432","cntpRate":"0.000018417144069595","referrals":"1"},{"wallet":"0x04da1eb9e11a79c756669741eda149b7fac3942e","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x6d379cb771e9dcd07bab444456c2fa68b4e9982d","cntpRate":"0.000055251432208784","referrals":"1"},{"wallet":"0x967b11540b7b0f891e01aae8509ec9fecf34b942","cntpRate":"0.000018417144069595","referrals":"1"},{"wallet":"0x806c79f44fe71717cf8d8b81f9b55ef5cdd6a10f","cntpRate":"0.000092085720347974","referrals":"1"},{"wallet":"0x7626a7fcb16f8962a12ef67726012306e19994a2","cntpRate":"0.000092085720347974","referrals":"1"}]')`
	const cassClient = new Client (option)
	let kk
	try {
		kk = await cassClient.execute (cmd)
	} catch(ex) {
		logger(ex)
		await cassClient.shutdown()
		return null
	}
	await cassClient.shutdown()
	logger(inspect(kk, false, 3, true))
	return (kk.rows)

}

/** */

const test = async() => {
	// await testInsert()
	const kkk = await  selectLeaderboard()
	//const kkk1 = await selectLeaderboardEpoch('573822')
	// logger (inspect(kkk, false, 3, true))
	// logger(JSON.stringify(kkk).length)

}

// const test = async () => {
	
// 	const cassClient = new Client (option)
// 	//totalminerOnline = await getMinerCount (cassClient, 376894)
// 	//await deleteMiner('189.68.243.180')
// 	//const kkk = await getAllMinerIpaddress()
// 	//logger(inspect(kkk, false, 3, true), typeof kkk)
	
// 	//await updateNodeMiners(cassClient, '368633', 3)
// 	// startListeningCONET_Holesky_EPOCH()
// 	// logger(inspect(kkk, false, 3, true), typeof kkk)
// 	// const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)

// 	// const kkk = await freeMinerManager('191.205.216.248', '0x23033811ae9a29d01bc6a8368449f74d18c2ce18')
// 	// logger(inspect(kkk, false, 3, true), typeof kkk)
// 	// deleteMiner('191.205.216.248', '0x23033811ae9a29d01bc6a8368449f74d18c2ce18')
// 	await cassClient.shutdown()
// }

const testClaimeToekn = async () => {


	const data = {
		message: '{"walletAddress":"0x3b494e206788BEbaBa160F17Be231Dfdc27eB426","data":{"tokenName":"cUSDT","network":"CONET Holesky","amount":"125.000000"}}',
		signMessage: '0x5b118b1b029139e288b2a53b57ae4a5f0b0910e0bcf62cb28f6238956b8e0e1d6cb8eb45d156e82ba05047462e9720a5bb0eebfbc101ceaa46b408bfd47372741b'
	}
	await claimeToekn(data.message, data.signMessage)
	
}


// testClaimeToekn()
// test()