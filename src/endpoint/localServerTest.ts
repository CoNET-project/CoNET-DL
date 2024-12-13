import {createServer, createConnection, Socket} from 'node:net'
//@ts-ignore
import hexdump from 'hexdump-nodejs'
import Colors from 'colors/safe'
import {Transform} from 'node:stream'
import { TransformCallback } from 'stream'
import { logger } from '../util/logger'



export const hexDebug = ( buffer: Buffer, length: number= 256 ) => {
    console.log(Colors.underline(Colors.green(`TOTAL LENGTH [${ buffer.length }]`)))
    console.log(Colors.grey( hexdump( buffer.slice( 0, length ))))
}

class showdata extends Transform {
	constructor() {
		super()
	}
	public _transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback): void {
		logger(Colors.magenta(`from node`))
		hexDebug(chunk)
		callback(null, chunk)
	}
}

class showdata2 extends Transform {
	constructor() {
		super()
	}
	public _transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback): void {
		logger(Colors.magenta(`Curl to node`))
		hexDebug(chunk)
		callback(null, chunk)
	}
}

const connectClient = (host: string, req: Socket, data: Buffer) => {
	const data1 = new showdata()
	const data2 = new showdata2()
	const netC = createConnection(80, host, () => {
		netC.pipe(data1).pipe(req).pipe(data2).pipe(netC)
	})
	netC.write(data)
}

const startServer = () => {
	const server = createServer( socket => {
		let first = true
		socket.once('data', data => {
			const data1 = data.toString()
			
			const stream = data.toString()
			const host = stream.split(/Host: /)[1].split('\r\n')[0]
			logger(Colors.blue(`startServer got access to ${host}`))
			logger(Colors.red(JSON.stringify(stream)))
			return connectClient(host, socket, data)
			
		})
	})
	server.listen(3333)
}

startServer()




//		curl -X OPTIONS -H "Access-Control-Request-Method: POST"  https://rpc.conet.network -i