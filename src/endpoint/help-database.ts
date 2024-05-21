
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

export const testInsert = async () => {
	const cmd = `UPDATE conet_leaderboard_v1 SET referrals = '[{"wallet":"0xD8b12054612119e9E45d5Deef40EDca38d54D3b5","cntpRate":"0.41704892865000004","referrals":"63"},{"wallet":"0x8FCb191a4e40D0AFA37B2fa610377688992f057f","cntpRate":"0.34461887985833334","referrals":"53"},{"wallet":"0x561e9A11B3D11d237e2FD8ddd29926aE97933Aa7","cntpRate":"0.186954184375","referrals":"30"},{"wallet":"0x967B11540B7b0F891E01Aae8509Ec9fecF34b942","cntpRate":"0.14143848325833333","referrals":"23"},{"wallet":"0x8ab7B4BfE50738a8793735E7EB6948a0c7BAC9Ee","cntpRate":"0.09083151410833333","referrals":"15"},{"wallet":"0x0D4C91541400beD3AC4e1315aAA647030FF035Ea","cntpRate":"0.06609241951666667","referrals":"11"},{"wallet":"0x848b08302bF95DE9a1BF6be988c9D9Ef5616c4eF","cntpRate":"0.0356976669","referrals":"6"},{"wallet":"0xcF6AD29f268f4B62a0c2d0CB9816d46e4a0F1f94","cntpRate":"0.0356976669","referrals":"6"},{"wallet":"0x6C13339dF37027CDE88D0DCd6B8E9850809EDA52","cntpRate":"0.023704379600000002","referrals":"4"},{"wallet":"0x8AD17A0E7F2725b7A073E5D4e1f053e9d53041fD","cntpRate":"0.023704379600000002","referrals":"4"}]', cntp='[{"wallet":"0xD8b12054612119e9E45d5Deef40EDca38d54D3b5","cntpRate":"0.41704892865000004","referrals":"63"},{"wallet":"0x8FCb191a4e40D0AFA37B2fa610377688992f057f","cntpRate":"0.34461887985833334","referrals":"53"},{"wallet":"0x561e9A11B3D11d237e2FD8ddd29926aE97933Aa7","cntpRate":"0.186954184375","referrals":"30"},{"wallet":"0x967B11540B7b0F891E01Aae8509Ec9fecF34b942","cntpRate":"0.14143848325833333","referrals":"23"},{"wallet":"0x8ab7B4BfE50738a8793735E7EB6948a0c7BAC9Ee","cntpRate":"0.09083151410833333","referrals":"15"},{"wallet":"0x0D4C91541400beD3AC4e1315aAA647030FF035Ea","cntpRate":"0.06609241951666667","referrals":"11"},{"wallet":"0x848b08302bF95DE9a1BF6be988c9D9Ef5616c4eF","cntpRate":"0.0356976669","referrals":"6"},{"wallet":"0xcF6AD29f268f4B62a0c2d0CB9816d46e4a0F1f94","cntpRate":"0.0356976669","referrals":"6"},{"wallet":"0x6C13339dF37027CDE88D0DCd6B8E9850809EDA52","cntpRate":"0.023704379600000002","referrals":"4"},{"wallet":"0x8AD17A0E7F2725b7A073E5D4e1f053e9d53041fD","cntpRate":"0.023704379600000002","referrals":"4"}]',referrals_rate_list = '[{"wallet":"0xD8b12054612119e9E45d5Deef40EDca38d54D3b5","cntpRate":"0.41704892865000004","referrals":"63"},{"wallet":"0x8ab7B4BfE50738a8793735E7EB6948a0c7BAC9Ee","cntpRate":"0.09083151410833333","referrals":"15"},{"wallet":"0x916d1508b4776C43131E11dA27A626c00dA6D864","cntpRate":"0.0058790624","referrals":"1"},{"wallet":"0x8FCb191a4e40D0AFA37B2fa610377688992f057f","cntpRate":"0.34461887985833334","referrals":"53"},{"wallet":"0x561e9A11B3D11d237e2FD8ddd29926aE97933Aa7","cntpRate":"0.186954184375","referrals":"30"},{"wallet":"0x848b08302bF95DE9a1BF6be988c9D9Ef5616c4eF","cntpRate":"0.0356976669","referrals":"6"},{"wallet":"0xcF6AD29f268f4B62a0c2d0CB9816d46e4a0F1f94","cntpRate":"0.0356976669","referrals":"6"},{"wallet":"0x967B11540B7b0F891E01Aae8509Ec9fecF34b942","cntpRate":"0.14143848325833333","referrals":"23"},{"wallet":"0x6C13339dF37027CDE88D0DCd6B8E9850809EDA52","cntpRate":"0.023704379600000002","referrals":"4"},{"wallet":"0x8AD17A0E7F2725b7A073E5D4e1f053e9d53041fD","cntpRate":"0.023704379600000002","referrals":"4"},{"wallet":"0x527DadE4e0B11b1d13d5D528E58A01F6639Fdf57","cntpRate":"0.0058790624","referrals":"1"},{"wallet":"0xCb872981EC9C2A11fE614C6F04D4d533df02BF4F","cntpRate":"0.0118051573","referrals":"2"},{"wallet":"0xca10bEB7692fb90c86a3b113489dDD985A6A7046","cntpRate":"0.0058790624","referrals":"1"},{"wallet":"0x0D4C91541400beD3AC4e1315aAA647030FF035Ea","cntpRate":"0.06609241951666667","referrals":"11"}]' WHERE conet = 'guardians' AND epoch = '573958'`
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