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
  name: string;
  email: string;
  phone: string;
  document?: string; // CPF/CNPJ
  [key: string]: any;
}

interface AppmaxAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipcode: string;
  country?: string;
  [key: string]: any;
}

interface AppmaxOrder {
  id: number;
  status: string;
  total: number;
  customer: AppmaxCustomer;
  billing_address?: AppmaxAddress;
  shipping_address?: AppmaxAddress;
  payment_method?: string;
  created_at?: string;
  // Campos que podem conter o ID do pedido Shopify
  external_id?: string;
  order_id?: string;
  meta?: {
    shopify_order_id?: string;
    shopify_order_number?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface AppmaxWebhookPayload {
  event: string;
  order?: AppmaxOrder;
  customer?: AppmaxCustomer;
  [key: string]: any;
}

export async function POST(request: Request) {
  try {
    console.log('🔔 [Appmax Webhook] Recebendo webhook...');

    // 1. Parse do body
    const payload: AppmaxWebhookPayload = await request.json();

    console.log('📦 [Appmax Webhook] Evento:', payload.event);
    console.log('📦 [Appmax Webhook] Payload completo:', JSON.stringify(payload, null, 2));

    // 2. Verificar se é evento de pedido aprovado
    if (payload.event !== 'OrderApproved' && payload.event !== 'order_approved') {
      console.log(`ℹ️ [Appmax Webhook] Evento ignorado: ${payload.event}`);
      return NextResponse.json({
        success: true,
        message: `Event ${payload.event} ignored`
      });
    }

    // 3. Validar se tem dados do pedido
    if (!payload.order) {
      console.error('❌ [Appmax Webhook] Payload sem dados do pedido');
      return NextResponse.json({
        success: false,
        error: 'Missing order data'
      }, { status: 400 });
    }

    const order = payload.order;

    console.log('👤 [Appmax Webhook] Cliente:', {
      name: order.customer?.name,
      email: order.customer?.email,
      phone: order.customer?.phone
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
    const billingAddress = order.billing_address || order.shipping_address;
    const shippingAddress = order.shipping_address || order.billing_address;

    if (!billingAddress || !shippingAddress) {
      console.error('❌ [Appmax Webhook] Endereço não encontrado no payload');
      return NextResponse.json({
        success: false,
        error: 'Missing address data'
      }, { status: 400 });
    }

    // Dividir nome completo em first_name e last_name
    const nameParts = (order.customer?.name || '').trim().split(' ');
    const firstName = nameParts[0] || 'Cliente';
    const lastName = nameParts.slice(1).join(' ') || 'Appmax';

    const customerData = {
      first_name: firstName,
      last_name: lastName,
      email: order.customer?.email || 'sem-email@appmax.com',
      phone: order.customer?.phone || '',
      billing_address: {
        first_name: firstName,
        last_name: lastName,
        address1: `${billingAddress.street}, ${billingAddress.number}`,
        address2: billingAddress.complement || billingAddress.neighborhood || '',
        city: billingAddress.city,
        state: billingAddress.state,
        postcode: billingAddress.zipcode.replace(/\D/g, ''), // Remover formatação
        country: billingAddress.country || 'BR',
        phone: order.customer?.phone || ''
      },
      shipping_address: {
        first_name: firstName,
        last_name: lastName,
        address1: `${shippingAddress.street}, ${shippingAddress.number}`,
        address2: shippingAddress.complement || shippingAddress.neighborhood || '',
        city: shippingAddress.city,
        state: shippingAddress.state,
        postcode: shippingAddress.zipcode.replace(/\D/g, ''),
        country: shippingAddress.country || 'BR'
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
