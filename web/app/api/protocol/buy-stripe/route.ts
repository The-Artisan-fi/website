import * as anchor from '@coral-xyz/anchor';
import {
  IDL,
  Fragment,
  PROGRAM_ID,
  LISTING_GROUP,
} from '@/components/Utils/idl';
import {
  SYSVAR_INSTRUCTIONS_PUBKEY,
  PublicKey,
  SystemProgram,
  Keypair,
  Transaction,
  Connection,
  Ed25519Program,
} from '@solana/web3.js';

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import * as b58 from 'bs58';

//https://spl-token-faucet.com/?token-name=USDC-Dev
const USDC_DEV = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');

export async function POST(request: Request) {

  const intToBytes = (int: number): Uint8Array => {
    let buffer = new ArrayBuffer(4); // Create a buffer of 4 bytes (32 bits).
    let view = new DataView(buffer);
    view.setUint32(0, int, true); // Write the integer to the buffer. 'true' for little endian.
    return new Uint8Array(buffer);
  };

  console.log('route pinged');
  const wallet = Keypair.generate();
  const connection = new Connection(
    process.env.NEXT_PUBLIC_HELIUS_DEVNET!,
    'confirmed'
  );
  // @ts-expect-error - wallet is dummy variable, signing is not needed
  const provider = new anchor.AnchorProvider(connection, wallet, {});
  const programId = new PublicKey(PROGRAM_ID);
  const program = new anchor.Program<Fragment>(IDL, programId, provider);

  try {
    const req = await request.json();
    const buyer_publicKey = new PublicKey(req.publicKey);
    console.log('buyer_publicKey', buyer_publicKey.toBase58());
    const id = req.id;

    // const id = 10817;
    // VARIABLES
    const reference = req.reference;
    const amount = req.amount;
    const watch = PublicKey.findProgramAddressSync(
      [Buffer.from('watch'), Buffer.from(reference)],
      program.programId
    )[0];
    const listing = PublicKey.findProgramAddressSync(
      [
        Buffer.from('listing'),
        watch.toBuffer(),
        new anchor.BN(id).toBuffer('le', 8),
      ],
      program.programId
    )[0];
    const fraction = PublicKey.findProgramAddressSync(
      [Buffer.from('fraction'), listing.toBuffer()],
      program.programId
    )[0];
    // const metadata = PublicKey.findProgramAddressSync([Buffer.from('metadata'), fraction.toBuffer()], program.programId)[0];

    const auth = PublicKey.findProgramAddressSync(
      [Buffer.from('auth')],
      program.programId
    )[0];
    // const adminState = PublicKey.findProgramAddressSync([Buffer.from('admin_state'), buyer_publicKey.toBuffer()], program.programId)[0];

    const buyerProfile = PublicKey.findProgramAddressSync(
      [Buffer.from('profile'), buyer_publicKey.toBuffer()],
      program.programId
    )[0];
    const buyerFractionAta = getAssociatedTokenAddressSync(
      fraction,
      buyer_publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const listingCurrencyAta = getAssociatedTokenAddressSync(
      USDC_DEV,
      listing,
      true
    );
    const buyerCurrencyAta = getAssociatedTokenAddressSync(
      USDC_DEV,
      buyer_publicKey
    );

    // const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    //     buyer_publicKey,
    //     buyerFractionAta,
    //     buyer_publicKey,
    //     fraction,
    //     TOKEN_2022_PROGRAM_ID,
    //     ASSOCIATED_TOKEN_PROGRAM_ID,
    // );

    // const profileInitIx = await await program.methods
    //     .initializeProfileAccount()
    //     .accounts({
    //         user: buyer_publicKey,
    //         profile: buyerProfile,
    //         systemProgram: SystemProgram.programId,
    //     })
    //     .instruction();
    const feeKey = process.env.SIGNING_AUTHORITY!;
    const feePayer = Keypair.fromSecretKey(b58.decode(feeKey));

    const message = intToBytes(amount);
    const ed25519Ix = Ed25519Program.createInstructionWithPrivateKey({
      privateKey: feePayer.secretKey,
      message,
    });

const buyShareIx = await program.methods
      .buyListing()
      .accounts({
        // buyer: buyer_publicKey,
        // payer: feePayer.publicKey,
        // buyerProfile,
        // buyerCurrencyAta,
        // buyerFractionAta,
        // listing,
        // listingCurrencyAta,
        // fraction,
        // currency: USDC_DEV,
        // auth,
        // associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        // tokenProgram: TOKEN_PROGRAM_ID,
        // token2022Program: TOKEN_2022_PROGRAM_ID,
        // systemProgram: SystemProgram.programId,
        payer: feePayer.publicKey,
        buyer: buyer_publicKey,
        buyerProfile,
        buyerCurrencyAta,
        buyerFractionAta,
        listing,
        listingCurrencyAta,
        fraction,
        currency: USDC_DEV,
        auth,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction();

    const { blockhash } = await connection.getLatestBlockhash('finalized');

    const transaction = new Transaction({
      recentBlockhash: blockhash,
      feePayer: feePayer.publicKey,
    });
    for (let i = 0; i < amount; i++) {
      console.log('buying share', i);
      transaction.add(ed25519Ix).add(buyShareIx);
    }
    transaction.partialSign(feePayer);
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
    });
    const base64 = serializedTransaction.toString('base64');

    return new Response(JSON.stringify({ transaction: base64 }), {
      headers: {
        'content-type': 'application/json',
      },
    });
  } catch (e) {
    console.log(e);
    throw e;
  }
}