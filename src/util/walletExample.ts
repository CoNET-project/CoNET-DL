import {ethers} from 'ethers'
import {RequestOptions, request} from 'node:https'
import {inspect} from 'node:util'

const conetAPIServerURL = `https://apiv4.conet.network/api/`

const postToServer = (url: string, obj: any) => new Promise(async resolve => {
	const Url = new URL (url)
	const option: RequestOptions = {
		hostname: Url.hostname,
		path: Url.pathname,
		port: 443,
		method: 'POST',
		protocol: 'https:',
		headers: {
			'Content-Type': 'application/json'
		}
	}
	
	const req = await request (option, res => {
		let body = ''
		res.on('data', _data => {
			body += _data.toString()
		})


		res.on('end', () => {
			try {
				const ret = JSON.parse(body)
				return resolve (ret)
			} catch (ex) {
				return resolve(false)
			}
		})

		res.once('error', err => {
			resolve(false)
		})
		
	})

	req.once('error', (e) => {
		resolve(false)
	})

	req.write(JSON.stringify(obj))
	req.end()
})

const conetAPI = async (privateKey: string, path: string, portObject: Record<string, any>) => {
	//		使用私鑰創建錢包
	const wallet = new ethers.Wallet(privateKey)

	//		把簽名的公鑰放入JSON
	portObject.walletAddress = wallet.address

	//		轉換送出的JSON為字符串
	const message = JSON.stringify(portObject)

	//		簽名送出的字符串
	const signMessage = wallet.signMessage(message)

	//		製作送POST 數據
	const postDate = {message, signMessage}

	//		API URL
	const apiUrl = `conetAPIServerURL${path}`

	const result = await postToServer(apiUrl, postDate)

	if (!result) {
		return console.log(`conetAPI error!`)
	}

	console.log(`conetAPI ${inspect(portObject, false, 3, true)} SUCCESS!`)

}

