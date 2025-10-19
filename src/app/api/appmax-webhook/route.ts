import { NextResponse } from 'next/server';
import { updateWooCommerceOrderCustomer } from '@/services/woocommerce.service';
import { findShopifyOrderByAppmaxId } from '@/services/shopify.service';

/**
 * 🔔 API ROUTE: Appmax Webhook → Update WooCommerce Order Customer Data
 *
 * POST /api/appmax-webhook
 *
 * Este endpoint recebe webhooks do Appmax quando um pedido é aprovado
 * e atualiza o pedido correspondente no WooCommerce com os dados completos do cliente.
 *
 * Appmax Events:
 * - Pedido aprovado: Atualiza pedido no WooCommerce com dados do cliente
 */

interface AppmaxCustomer {
  id: number;
  firstname: string;
  lastname: string;
  fullname: string;
  email: string;
  telephone: string;
  postcode: string;
  address_street: string;
  address_street_number: string;
  address_street_complement: string;
  address_street_district: string;
  address_city: string;
  address_state: string;
  document_number?: string; // CPF/CNPJ
  uf?: string;
  [key: string]: any;
}

interface AppmaxOrder {
  id: number;
  status: string;
  total: number | string;
  customer: AppmaxCustomer;
  payment_type?: string;
  created_at?: string;
  paid_at?: string;
  // Campos que podem conter o ID do pedido Shopify
  external_id?: string;
  order_id?: string;
  [key: string]: any;
}

interface AppmaxWebhookPayload {
  environment: string;
  event: string;
  data: AppmaxOrder;
  [key: string]: any;
}

export async function POST(request: Request) {
  try {
    console.log('🔔 [Appmax Webhook] Recebendo webhook...');

    // 1. Parse do body
    const payload: AppmaxWebhookPayload = await request.json();

    console.log('📦 [Appmax Webhook] Evento:', payload.event);
    console.log('📦 [Appmax Webhook] Payload completo:', JSON.stringify(payload, null, 2));

    // 2. Verificar se é evento válido
    const validEvents = ['OrderApproved', 'order_approved', 'OrderPaid', 'order_paid'];
    if (!validEvents.includes(payload.event)) {
      console.log(`ℹ️ [Appmax Webhook] Evento ignorado: ${payload.event}`);
      return NextResponse.json({
        success: true,
        message: `Event ${payload.event} ignored`
      });
    }

    // 3. Validar se tem dados do pedido
    if (!payload.data) {
      console.error('❌ [Appmax Webhook] Payload sem dados do pedido');
      return NextResponse.json({
        success: false,
        error: 'Missing order data'
      }, { status: 400 });
    }

    const order = payload.data;

    console.log('👤 [Appmax Webhook] Cliente:', {
      name: order.customer?.fullname || `${order.customer?.firstname} ${order.customer?.lastname}`,
      email: order.customer?.email,
      phone: order.customer?.telephone
    });

    // 4. CRÍTICO: Encontrar o ID do pedido Shopify
    // O Appmax pode enviar isso em vários lugares:
    let shopifyOrderId: string | null = null;

    // Tentar encontrar o ID da Shopify em diferentes campos
    if (order.meta?.shopify_order_id) {
      shopifyOrderId = order.meta.shopify_order_id.toString();
    } else if (order.external_id) {
      shopifyOrderId = order.external_id.toString();
    } else if (order.order_id) {
      shopifyOrderId = order.order_id.toString();
    }

    // Se não encontrou no payload do Appmax, buscar na Shopify pelo appmax_order_id
    if (!shopifyOrderId && order.id) {
      console.log(`🔍 [Appmax Webhook] Buscando pedido Shopify pelo appmax_order_id: ${order.id}`);
      shopifyOrderId = await findShopifyOrderByAppmaxId(order.id);
    }

    if (!shopifyOrderId) {
      console.warn('⚠️ [Appmax Webhook] Shopify Order ID não encontrado');
      console.warn('⚠️ [Appmax Webhook] Appmax Order ID:', order.id);
      console.warn('⚠️ [Appmax Webhook] Campos disponíveis:', Object.keys(order));

      // Salvar payload completo para análise
      try {
        const fs = require('fs');
        const path = require('path');
        const debugDir = path.join(process.cwd(), 'debug', 'appmax-webhooks');
        fs.mkdirSync(debugDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `appmax-${order.id}-${timestamp}.json`;
        const filepath = path.join(debugDir, filename);
        fs.writeFileSync(filepath, JSON.stringify(payload, null, 2), 'utf8');
        console.log('🐛 [Debug] Payload Appmax salvo em:', filepath);
      } catch (debugError) {
        console.warn('⚠️ [Debug] Não foi possível salvar payload:', debugError);
      }

      return NextResponse.json({
        success: false,
        error: 'Shopify Order ID not found',
        appmax_order_id: order.id,
        hint: 'Pedido pode não ter sido criado na Shopify ainda'
      }, { status: 400 });
    }

    console.log(`🔗 [Appmax Webhook] Shopify Order ID encontrado: ${shopifyOrderId}`);

    // 5. Preparar dados do cliente
    const customer = order.customer;

    if (!customer) {
      console.error('❌ [Appmax Webhook] Dados do cliente não encontrados');
      return NextResponse.json({
        success: false,
        error: 'Missing customer data'
      }, { status: 400 });
    }

    // Nome do cliente
    const firstName = customer.firstname || 'Cliente';
    const lastName = customer.lastname || 'Appmax';

    // Endereço completo
    const address1 = `${customer.address_street || ''}, ${customer.address_street_number || ''}`.trim();
    const address2 = [
      customer.address_street_complement,
      customer.address_street_district
    ].filter(Boolean).join(' - ');

    const customerData = {
      first_name: firstName,
      last_name: lastName,
      email: customer.email || 'sem-email@appmax.com',
      phone: customer.telephone || '',
      billing_address: {
        first_name: firstName,
        last_name: lastName,
        address1: address1 || '',
        address2: address2 || '',
        city: customer.address_city || '',
        state: customer.address_state || customer.uf || '',
        postcode: (customer.postcode || '').replace(/\D/g, ''), // Remover formatação
        country: 'BR',
        phone: customer.telephone || ''
      },
      shipping_address: {
        first_name: firstName,
        last_name: lastName,
        address1: address1 || '',
        address2: address2 || '',
        city: customer.address_city || '',
        state: customer.address_state || customer.uf || '',
        postcode: (customer.postcode || '').replace(/\D/g, ''),
        country: 'BR'
      }
    };

    console.log('📝 [Appmax Webhook] Dados do cliente preparados:', {
      name: `${firstName} ${lastName}`,
      email: customerData.email,
      phone: customerData.phone,
      city: customerData.billing_address.city
    });

    // 6. Atualizar pedido no WooCommerce
    console.log('🔄 [Appmax Webhook] Atualizando pedido no WooCommerce...');

    const result = await updateWooCommerceOrderCustomer(shopifyOrderId, customerData);

    if (!result.success) {
      console.error('❌ [Appmax Webhook] Erro ao atualizar:', result.error);
      return NextResponse.json({
        success: false,
        error: result.error
      }, { status: 500 });
    }

    console.log('✅ [Appmax Webhook] Pedido atualizado com sucesso:', {
      woo_order_id: result.woo_order_id,
      customer_name: `${firstName} ${lastName}`,
      appmax_order_id: order.id
    });

    return NextResponse.json({
      success: true,
      woo_order_id: result.woo_order_id,
      message: 'Customer data updated from Appmax webhook'
    });

  } catch (error) {
    console.error('❌ [Appmax Webhook] Erro:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
