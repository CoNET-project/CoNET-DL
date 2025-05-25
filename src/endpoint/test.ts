import { Keypair } from '@solana/web3.js'
import nacl from 'tweetnacl'
import { decodeUTF8 } from 'tweetnacl-util'
import bs58 from 'bs58'


const test = () => {
    // Generate a keypair (replace with your actual keypair)
    const keypair = Keypair.generate()
    const publicKey = keypair.publicKey

    // Message to be signed
    const message = 'This is a test message'
    const encodedMessage = new TextEncoder().encode(message)

    // Sign the message
    const signature = nacl.sign.detached(encodedMessage, keypair.secretKey)
    const encodedSignature = bs58.encode(signature)

    // Verify the signature
    const isValid = nacl.sign.detached.verify(encodedMessage, signature, publicKey.toBytes());

    console.log('Message:', message);
    console.log('Public Key:', publicKey.toBase58());
    console.log('Signature:', encodedSignature);
    console.log('Is valid signature:', isValid);
}

test()