
import type { TLSSocketOptions } from 'node:tls'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { homedir, platform } from 'node:os'
import { logger, getIpaddressLocaltion, getConfirmations, checkPublickeySign, decryptPayload, postRouterToPublic, regiestCloudFlare } from '../util/util'
import { createHash } from 'node:crypto'
import type {RequestOptions} from 'node:http'
import { request } from 'node:https'
import {v4} from 'uuid'
import {encryptWithPublicKey, createIdentity, hash, decryptWithPrivateKey, recover } from 'eth-crypto'


import Color from 'colors/safe'

import { Client, auth, types } from 'cassandra-driver'

const Eth = require('web3-eth')

const setup = join( homedir(),'.master.json' )

const masterSetup: ICoNET_DL_masterSetup = require ( setup )

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

const CoNET_SI_healthy_TTL = 1 * 60 * 5

export const CoNET_SI_Register = ( data: ICoNET_DecryptedPayload, s3pass: s3pass ) => {

	return new Promise(async resolve => {
		const cassClient = new Client (option)
		const payload: ICoNET_DL_POST_register_SI = data.payload


		const time = new Date()
		
		payload.ip_api = await getIpaddressLocaltion (payload.ipV4)

		if ( !payload.ip_api || !payload.pgpPublicKey ) {
			return resolve (false)
		}

		const pgpKey = await checkPublickeySign (payload.pgpPublicKey)

		if (!/^0[xX]/.test(payload.wallet_CoNET)) {
			payload.wallet_CoNET = '0X' + payload.wallet_CoNET
		}
		if ( !pgpKey || data.senderAddress !== payload.wallet_CoNET.toUpperCase()) {

			logger (Color.red(`CoNET_SI_Register !pgpKey || data.publickey.toUpperCase() !== payload.wallet_CoNET.toUpperCase() ERROR`), inspect(data, false, 3, true ))
			return resolve (false)
		}

		const nft_tokenid = createHash('sha256').update(payload.ipV4).digest('base64')
		const customs_review_total = (Math.random()*5).toFixed(2)

		logger (`CoNET_SI_Register data\n${ inspect( payload, false, 3, true )}`)
		const cmd = `INSERT INTO conet_si_nodes ( wallet_addr, ip_addr, outbound_fee, storage_fee, registration_date, `+
					`country, region, lat, lon, customs_review_total, `+
					`pgp_publickey_id, nft_tokenid, total_online, last_online) VALUES (` +
					` '${ data.senderAddress }', '${ payload.ipV4 }', ${ payload.outbound_price }, ${ payload.storage_price }, '${ time.toISOString() }', `+
					`'${ payload.ip_api.countryCode }', '${ payload.ip_api.region }', ${ payload.ip_api.lat }, ${ payload.ip_api.lon }, ${ customs_review_total }, `+
					`'${ pgpKey.publicKeyID }', '${ nft_tokenid }', 5, dateof(now())`+ `) `

		const cmd2 = `INSERT INTO conet_si_nodes_online ( wallet_addr, ip_addr, outbound_fee, storage_fee, registration_date, `+
					`country, region, lat, lon, customs_review_total, `+
					`pgp_publickey_id, nft_tokenid, total_online, last_online) VALUES (` +
					` '${ data.senderAddress }', '${ payload.ipV4 }', ${ payload.outbound_price }, ${ payload.storage_price }, '${ time.toISOString() }', `+
					`'${ payload.ip_api.countryCode }', '${ payload.ip_api.region }', ${ payload.ip_api.lat }, ${ payload.ip_api.lon }, ${customs_review_total}, ` +
					`'${ pgpKey.publicKeyID }', '${ nft_tokenid }', 5, dateof(now())`+ `) USING TTL ${ CoNET_SI_healthy_TTL } `
		const cmd3 = `INSERT INTO conet_si_nodes_customs_review ( wallet_addr, ip_addr, outbound_fee, storage_fee, registration_date, `+
					`country, region, lat, lon, customs_review_total, `+
					`pgp_publickey_id, nft_tokenid, total_online, last_online) VALUES (` +
					` '${ data.senderAddress }', '${ payload.ipV4 }', ${ payload.outbound_price }, ${ payload.storage_price }, '${ time.toISOString() }', `+
					`'${ payload.ip_api.countryCode }', '${ payload.ip_api.region }', ${ payload.ip_api.lat }, ${ payload.ip_api.lon }, ${ customs_review_total }, ` +
					`'${ pgpKey.publicKeyID }', '${ nft_tokenid }', 5, dateof(now())`+ `) USING TTL ${ CoNET_SI_healthy_TTL } `
		await cassClient.connect ()
		await cassClient.execute (cmd)
		await cassClient.execute (cmd2)
		await cassClient.execute (cmd3)
		await cassClient.shutdown()
		await postRouterToPublic (data, pgpKey, s3pass)
		await regiestCloudFlare (payload.ipV4, pgpKey.publicKeyID, masterSetup )
		return resolve (nft_tokenid)
	})
}

export const CoNET_SI_health = ( message: string, signature: string ) => {

	return new Promise( async resolve => {

		const yyy = decryptPayload( message, signature )

		if ( !yyy||! yyy.payload?.nft_tokenid) {
			logger (`CoNET_SI_health ERROR!, encryptedString have no nft_tokenid! payload = [${ inspect( yyy, false, 3, true ) }]`)
			return resolve (false)
		}

		const cassClient = new Client (option)
		const nft_tokenid = yyy.payload.nft_tokenid

		const cmd = `Select * from conet_si_nodes WHERE nft_tokenid = '${ nft_tokenid }'`
		const res = await cassClient.execute (cmd)
		const oldData = res.rows[0]

		if ( !res.rowLength || oldData.pgp_publickey_id !== yyy.payload.publickey.toUpperCase()) {
			await cassClient.shutdown ()
			logger (`CoNET_SI_health ERROR!, SI have no nft_tokenid or wrong pgp_publickey_id. payload = [${ inspect( yyy.payload, false, 3, true ) }] DB = [${ inspect(oldData, false, 3, true) }]` )
			return resolve (false)
		}

		
		const customs_review_total = (Math.random()*5).toFixed(2)
		
		logger (`SUCCESS!`, inspect (oldData, false, 3, true ))

		const cmd1 = `UPDATE conet_si_nodes SET customs_review_total = ${ customs_review_total }, total_online = ${oldData.total_online} + 5, last_online = dateof(now()) Where country = '${oldData.country}' and nft_tokenid = '${oldData.nft_tokenid}'`
		await cassClient.execute (cmd1)

		const cmd2 = `INSERT INTO conet_si_nodes_online ( wallet_addr, ip_addr, outbound_fee, storage_fee, registration_date, `+
			`country, region, lat, lon, customs_review_total, `+
			`pgp_publickey_id, nft_tokenid, total_online, last_online) VALUES (` +
			` '${ oldData.wallet_addr }', '${ oldData.ip_addr }', ${ oldData.outbound_fee }, ${ oldData.storage_fee }, '${ oldData.registration_date }', `+
			`'${ oldData.country }', '${ oldData.region }', ${ oldData.lat }, ${ oldData.lon }, ${customs_review_total}, ` +
			`'${ oldData.pgp_publickey_id }', '${ nft_tokenid }', ${oldData.total_online + 5}, dateof(now())`+ `) USING TTL ${CoNET_SI_healthy_TTL} `

		const cmd3 = `INSERT INTO conet_si_nodes_customs_review ( wallet_addr, ip_addr, outbound_fee, storage_fee, registration_date, `+
			`country, region, lat, lon, customs_review_total, `+
			`pgp_publickey_id, nft_tokenid, total_online, last_online) VALUES (` +
			` '${ oldData.wallet_addr }', '${ oldData.ip_addr }', ${ oldData.outbound_fee }, ${ oldData.storage_fee }, '${ oldData.registration_date }', `+
			`'${ oldData.country }', '${ oldData.region }', ${ oldData.lat }, ${ oldData.lon }, ${customs_review_total}, ` +
			`'${ oldData.pgp_publickey_id }', '${ nft_tokenid }', ${oldData.total_online + 5}, dateof(now())`+ `) USING TTL ${CoNET_SI_healthy_TTL} `
		await cassClient.execute (cmd2)
		await cassClient.execute (cmd3)
		await cassClient.shutdown ()
		logger (`CoNET_SI_health SUCCESS!`)
		return resolve (true)
	})
}


export const getAllCoNET_SI_nodes = () => {
	return new Promise((resolve) => {
		const cassClient = new Client (option)
		return cassClient.connect ()
	})
}


const FaucetCount = 2
const FaucetTTL = 60 * 60 * 24
const fujiCONET = `https://conettech.ca/fujiCoNET`
const USDCNET = `https://mvpusdc.conettech.ca/mvpusdc`

const admin_public = masterSetup.master_wallet_public
const admin_private = masterSetup.master_wallet_private
const wei = 1000000000000000000

export const regiestFaucet = (wallet_addr: string, ipAddr: string ) => {
	
	return new Promise ( async resolve => {

		const cassClient = new Client (option)
		const time = new Date()

		await cassClient.connect ()
		const cmd = `SELECT expired from conet_faucet WHERE wallet_addr = '${wallet_addr.toUpperCase()}'`

		const result = await cassClient.execute (cmd)

		if ( result?.rowLength ) {

			const expireds = result.rows
			let expired = false
			expireds.forEach ( n => {
				if ( n.expired === true ) {
					logger (n)
					expired = true
				}
			})
			if ( expired ) {
				logger (`${wallet_addr} have data\n`)
				await cassClient.shutdown ()
				return resolve (false)
			}
			
		}

		logger (`[${ wallet_addr }] have no expired`, inspect (result.rows, false, 3, true))

		const eth = new Eth ( new Eth.providers.HttpProvider(fujiCONET))
		const obj = {
			gas: 21000,
			to: wallet_addr,
			value: (FaucetCount * wei).toString()
		}
		const createTransaction = await eth.accounts.signTransaction( obj, admin_private )
		const receipt = await eth.sendSignedTransaction (createTransaction.rawTransaction )
		const cmd1 = `INSERT INTO conet_faucet (wallet_addr, timestamp, total, transaction_hash) VALUES ('${wallet_addr.toUpperCase()}', '${time.toISOString()}', ${FaucetCount}, '${receipt.transactionHash.toUpperCase()}')`
		await cassClient.execute (cmd1)
		const cmd2 = `UPDATE conet_faucet USING TTL ${FaucetTTL} SET expired = true WHERE wallet_addr = '${wallet_addr.toUpperCase()}' and timestamp = '${time.toISOString()}'`
		await cassClient.execute (cmd2)
		await cassClient.shutdown ()
		return resolve (receipt.transactionHash)
	})
	
}

const storeCoNET_market = (price: number, oneDayPrice: number) => {
	return new Promise ( async resolve => {
		const cassClient = new Client (option)
		const time = new Date()
		const cmd = `INSERT INTO conet_market (date, price, value_24hours, token_id) VALUES ('${time.toISOString()}', ${ price }, ${ oneDayPrice }, 'AVAX')`
		await cassClient.execute (cmd)
		await cassClient.shutdown ()
		return resolve (null)
	})
}
const streamCoNET_USDCInterval = 3 * 60 * 1000

export const streamCoNET_USDCPrice = (quere: any[]) => {

	quere.shift ()
	const option:RequestOptions = {
		host: 'min-api.cryptocompare.com',
		method: 'GET',
		path: '/data/pricemultifull?fsyms=AVAX&tsyms=USD',
		headers: {
			'accept': 'application/json'
		},
		port: 443
	}

	const req = request (option, res => {
		let _data = ''
		res.on ('data', data => {
			_data += data.toString ()
		})

		res.once ('end', async () => {

			let response
			try {
				response = JSON.parse (_data)
			} catch (ex) {
				return logger (Color.red(`streamCoNET_USDCInterval JSON.parse Error`), _data)
			}
			
			await storeCoNET_market (response.RAW.AVAX.USD.PRICE, response.RAW.AVAX.USD.VOLUME24HOUR)
			logger (`streamCoNET_USDCInterval SUCCESS!, PRICE [${Color.green(response.RAW.AVAX.USD.PRICE)}] VOLUME24HOUR[${Color.green(response.RAW.AVAX.USD.VOLUME24HOUR)}]`)

		})
	})


	req.once ('error', err => {
		logger (Color.red(`streamCoNET_USDCPrice request Once Error`), err )
	})

	req.end (() => {
		if ( !quere.length ) {
			const kk = setTimeout (() => {
				streamCoNET_USDCPrice (quere)
			}, streamCoNET_USDCInterval)
			quere.unshift (kk)
		}
	})
	
	
}

export const getLast5Price = () => {
	return new Promise ( async resolve => {
		const cassClient = new Client (option)
		const cmd = `SELECT date, price, value_24hours from conet_market where token_id ='AVAX' order by date DESC LIMIT 5`
		const res = await cassClient.execute (cmd)
		await cassClient.shutdown ()
		return resolve(res.rows)
	})
}

const estimateGas = async (wallet_addr: string ) => {
	const eth = new Eth ( new Eth.providers.HttpProvider(fujiCONET))
	const gas = await eth.estimateGas ({
		to: wallet_addr,
		from: admin_public,
		value: wei.toString()
	})
}

export const exchangeUSDC = (txHash: string) => {
	return new Promise ( async resolve => {
		const _res = await getConfirmations (txHash, admin_public, fujiCONET)
		if (!_res) {
			logger (`getConfirmations have no data!`)
			return resolve(false)
		}
		logger (inspect(_res, false, 3, true ))
		const cassClient = new Client (option)
		const cmd2 = `SELECT from_transaction_hash from conet_usdc_exchange where from_addr = '${ _res.from.toUpperCase() }' and from_transaction_hash = '${ txHash.toUpperCase() }'`
		const rowLength = await cassClient.execute (cmd2)
		
		if ( rowLength.rowLength > 0 ) {
			logger (`exchangeUSDC txHash[${ txHash }] already had data!`)
			await cassClient.shutdown ()
			return resolve(false)
		}
		logger (inspect(rowLength, false, 3, true))
		const cmd = `SELECT price from conet_market where token_id ='AVAX' order by date DESC LIMIT 1`
		const rate = (await cassClient.execute (cmd)).rows[0].price
		const usdc = rate * _res.value

		const obj = {
			gas: 21000,
			to: _res.from,
			value: (usdc * wei).toString()
		}
		const eth = new Eth ( new Eth.providers.HttpProvider(USDCNET))
		const time = new Date()
		let createTransaction
		try {
			createTransaction = await eth.accounts.signTransaction( obj, admin_private )
		} catch (ex) {
			logger (`exchangeUSDC eth.sendSignedTransaction ERROR`, ex )
			return resolve(false)
		}
		const receipt = await eth.sendSignedTransaction (createTransaction.rawTransaction )
		const cmd1 = `INSERT INTO conet_usdc_exchange (from_addr, timestamp, from_transaction_hash, rate, total_conet, total_usdc, transaction_hash) VALUES (` +
			`'${ _res.from.toUpperCase() }', '${time.toISOString()}', '${ txHash.toUpperCase() }', ${rate}, ${ _res.value }, ${ usdc }, '${receipt.transactionHash.toUpperCase()}')`
		await cassClient.execute (cmd1)
		await cassClient.shutdown ()
		return resolve(receipt.transactionHash)
	})
	
	


}
const asset_name = 'USDC'

export const mint_conetcash = async (txHash: string, sign: string ) => {
	if (!txHash || !sign) {
		logger (`mint_conetcash Error: !txHash || !sign`)
		return false
	}

	const usdcData = await getConfirmations(txHash, admin_public, USDCNET)
	if ( !usdcData || usdcData.value <= 0 || usdcData.value > 100 ) {
		logger (`mint_conetcash have no usdcData or usdcData.value have not in []`, inspect(usdcData, false, 3, true))
		return false
	}
	const cassClient = new Client (option)
	const cmd1 = `SELECT from_transaction_hash from conet_dl_conetcash where asset_name = '${ asset_name }' and from_transaction_hash = '${ txHash.toUpperCase()  }'`
	const rowLength = (await cassClient.execute (cmd1)).rowLength
	if (rowLength > 0) {
		await cassClient.shutdown ()
		logger (`mint_conetcash ERROR: had same txHash [${ txHash.toUpperCase() }]`)
		return false
	}

	const message = hash.keccak256('0xD493391c2a2AafEd135A9f6164C0Dcfa9C68F1ee')
	const keyID: string = recover(sign, message)
	const time = new Date()
	const fee = usdcData.value * 0.0001
	const balance = usdcData.value - fee
	const id = v4().toUpperCase()
	const cmd2 = `INSERT INTO conet_dl_conetcash (owner_addr, asset_name, from_transaction_hash, timestamp, deposit_tokens, balance, dl_id, Genesis_Fee, transfer_fee_total) VALUES (` + 
		`'${keyID.toUpperCase()}', '${asset_name}', '${ txHash.toUpperCase() }', '${time.toISOString()}', ${usdcData.value}, ${balance}, '${id}', ${fee}, 0)`
	await cassClient.execute (cmd2)
	const cmd3 = `INSERT INTO conet_dl_conetcash_dl_id (owner_addr, asset_name, from_transaction_hash, timestamp, deposit_tokens, balance, dl_id, Genesis_Fee, transfer_fee_total) VALUES (` + 
		`'${keyID.toUpperCase()}', '${asset_name}', '${ txHash.toUpperCase() }', '${time.toISOString()}', ${usdcData.value}, ${balance}, '${id}', ${fee}, 0)`
	await cassClient.execute (cmd3)
	await cassClient.shutdown ()
	return id
}

export const conetcash_getBalance = (id: string ) => {
	return new Promise( async resolve => {
		const cmd1 = `SELECT * from conet_dl_conetcash_dl_id where asset_name='${asset_name}' and dl_id='${id.toUpperCase()}'`
		const cassClient = new Client (option)
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


/****************************************************************************
 * 
 * 			TEST AREA
 * 
 ***************************************************************************/
/*

const testWallet = '0xc45543B3Ad238696a417b94483D313794541c4dF'

regiestFaucet (testWallet)
/*

initDatabase ( err => {
	if ( err ) {
		return logger ( err )
	}
	logger ('success')
})
/** */
/*
const ttt = async () => {
	const uuuu = await regiestFaucet ('0f044fcc79b761b3368fc05954abb4107c1c722a')
	console.log (uuuu)
}

ttt()
/** */
/*
const kk = '{"nft_tokenid":"AnB5oHdd77KM5JdytIO/bcf7GxQbakmIR5e9flaSFuU=","publickey":"2815A3B8624BD3B4"}'
const kk1 = `0xfdb478abe7adda90d126bd3c52f5ca5fecd2558adca370a6caf0e07b84a6ae77161fe309f683497e5b551992987f3db0fb58bc711031b7190ebb4adf283ffb7d1b`
CoNET_SI_health (kk, kk1)

/*
const h = {
  message: '{"nft_tokenid":"AnB5oHdd77KM5JdytIO/bcf7GxQbakmIR5e9flaSFuU="}',
  signature: '0x28df4df250a81536eca40132d81de29fe3d529275c0e1082c29287952577d2fe734c8ca9275a1af59d98366a2be0e834be93675f38317de2db7f494347bf2e001b'
}

const yyy = decryptPayload(h.message, h.signature )
logger (inspect(yyy, false, 3, true))

/*
const uu = {
	payload: {
		ipV4Port: 80,
		ipV4: '74.208.24.74',
		storage_price: 0.01,
		outbound_price: 0.00001,
		wallet_CoNET: '0f044fcc79b761b3368fc05954abb4107c1c722a',
		wallet_CNTCash: '67ca937c35f6d188dafddbd266824febc902a2dc',
		publicKey:'publicKey67ca937c35f6d188dafddbd266824febc902a2dc'
		
	},
	senderAddress: '0x0f044fcC79b761b3368Fc05954AbB4107c1c722a',
	publickey: ''
}
/** */
/*
const uu = async () => {
	const ret = await exchangeUSDC ('0xd5e2e2d9a8aef8200042e304780ec8b46eced8095415bda95f6242bdc95491bb')
	logger (`exchangeUSDC success`, ret)
}
uu()

/** */
/*
const sign = '0xdb1dd23e916028545e0c846edbba3c0c8414daef9c79c9dc9696f393a59937b00bf5443d0c9b31ff1de64624896a0efb9a92b5e46874b78231de9132394addbd1c'
const message = '0xf7c8807af619b93ed15e3508791a2d34e4e85d18fd5f212749345c2458120e64'

logger (`SUCCESS`, mint_conetcash (message, sign))

/*
const uu = async () => {
	const uu: any = await getLast5Price ()
	uu.forEach ((n: any) => {
		logger (n.date, n.price, n.value_24hours)
	})
}
uu()
/** */
/*
const uu = async () => {
	const ret = await conetcash_getBalance ('BD4E8700-71AB-4933-A8E6-DE06C7BC4A11', '')
	logger (inspect(ret, false, 3, true))
}
uu()

/*
const uu: any[] = []

streamCoNET_USDCPrice (uu)

/** */
/*
/** */
/*
CoNET_SI_health ('{"nft_tokenid":"AnB5oHdd77KM5JdytIO/bcf7GxQbakmIR5e9flaSFuU="}', '0xb4e227f28d6c62c8de70bd54491dfaecaececf9e4eaa374f0804a4e01ab8753334129ead87987f1e220247259a05a8b120b28d96db24423902a57c760a204e7d1c')


/*
const uu = {
	payload: {
	  ipV4Port: 80,
	  ipV4: '74.208.24.74',
	  storage_price: 0.01,
	  outbound_price: 0.00001,
	  wallet_CoNET: 'c586fadac9b5d2a42a1a9fbf25cf66f1b316b242',
	  wallet_CNTCash: '0b9d9c1b30b5277b5900cd8c9cd9ed3ff5922c27'
	},
	senderAddress: '0xc586fADAC9B5d2A42a1a9FBF25CF66F1b316b242',
	publickey: 'ee05fec1a493ccc6be33a49ba52eeb70adf383d05ec0a41c008e917dd9a9b313fa1170219c8cac1981f62f189a73b79577b787678082d81f6ff0221e7664b485'
  }
CoNET_SI_Register(uu)



/** */