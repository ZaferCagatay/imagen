/* eslint-disable camelcase */
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { createTransaction } from '@/lib/actions/transaction.action';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  console.time('stripe webhook total');

  try {
    console.log('Stripe webhook started');

    const body = await request.text();
    const sig = request.headers.get('stripe-signature');

    if (!sig) {
      console.error('Missing stripe-signature header');
      return NextResponse.json(
        { message: 'Missing signature' },
        { status: 400 },
      );
    }

    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!endpointSecret) {
      console.error('Missing STRIPE_WEBHOOK_SECRET');
      return NextResponse.json(
        { message: 'Missing STRIPE_WEBHOOK_SECRET' },
        { status: 500 },
      );
    }

    console.log('Verifying Stripe event');

    const event = stripe.webhooks.constructEvent(body, sig, endpointSecret);

    console.log('Stripe event verified:', event.type);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      const transaction = {
        stripeId: session.id,
        amount: session.amount_total ? session.amount_total / 100 : 0,
        plan: session.metadata?.plan || '',
        credits: Number(session.metadata?.credits) || 0,
        buyerId: session.metadata?.buyerId || '',
        createdAt: new Date(),
      };

      console.log('Webhook transaction payload:', transaction);

      if (!transaction.buyerId || !transaction.credits) {
        console.error('Missing metadata:', session.metadata);
        return NextResponse.json(
          { message: 'Missing buyerId or credits', metadata: session.metadata },
          { status: 400 },
        );
      }

      console.time('createTransaction');
      const newTransaction = await createTransaction(transaction);
      console.timeEnd('createTransaction');

      console.log('Stripe transaction created:', newTransaction);

      console.timeEnd('stripe webhook total');

      return NextResponse.json({
        message: 'OK',
        transaction: newTransaction,
      });
    }

    console.log('Ignored Stripe event:', event.type);
    console.timeEnd('stripe webhook total');

    return NextResponse.json({ message: 'Event ignored', type: event.type });
  } catch (error) {
    console.error('Stripe webhook failed:', error);
    console.timeEnd('stripe webhook total');

    return NextResponse.json(
      {
        message: 'Stripe webhook failed',
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
