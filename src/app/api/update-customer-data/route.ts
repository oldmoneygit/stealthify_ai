import { NextResponse } from 'next/server';
import { updateWooCommerceOrderCustomer } from '@/services/woocommerce.service';

/**
 * 📝 API ROUTE: Update Customer Data from Shopify Thank You Page
 *
 * POST /api/update-customer-data
 *
 * Este endpoint recebe dados do cliente capturados na Thank You Page da Shopify
 * e atualiza o pedido correspondente no WooCommerce com os dados completos.
 *
 * Trigger: Script JavaScript na Shopify Thank You Page
 * Timing: Imediatamente após pagamento aprovado
 */

interface CustomerDataPayload {
  shopify_order_id: number;
  order_number: number;
  customer_name: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_email: string;
  customer_phone: string;
  billing_address: {
    first_name: string;
    last_name: string;
    name: string;
    address1: string;
    address2: string;
    city: string;
    province: string;
    province_code: string;
    country: string;
    country_code: string;
    zip: string;
    phone: string;
  };
  shipping_address: {
    first_name: string;
    last_name: string;
    name: string;
    address1: string;
    address2: string;
    city: string;
    province: string;
    province_code: string;
    country: string;
    country_code: string;
    zip: string;
    phone: string;
  };
  captured_at: string;
}

export async function POST(request: Request) {
  try {
    console.log('📝 [Update Customer] Recebendo dados da Thank You Page...');

    // 1. Verificar token de segurança
    const token = request.headers.get('x-shopify-thank-you-token');
    const expectedToken = process.env.SHOPIFY_THANK_YOU_TOKEN;

    if (!expectedToken) {
      console.error('❌ [Update Customer] SHOPIFY_THANK_YOU_TOKEN não configurado');
      return NextResponse.json({
        success: false,
        error: 'Server configuration error'
      }, { status: 500 });
    }

    if (token !== expectedToken) {
      console.error('❌ [Update Customer] Token inválido');
      return NextResponse.json({
        success: false,
        error: 'Invalid token'
      }, { status: 401 });
    }

    // 2. Parse do body
    const customerData: CustomerDataPayload = await request.json();

    console.log('📦 [Update Customer] Dados recebidos:', {
      shopify_order_id: customerData.shopify_order_id,
      order_number: customerData.order_number,
      customer_name: customerData.customer_name,
      customer_email: customerData.customer_email,
      customer_phone: customerData.customer_phone
    });

    // 3. Validar dados obrigatórios
    if (!customerData.shopify_order_id) {
      return NextResponse.json({
        success: false,
        error: 'Missing shopify_order_id'
      }, { status: 400 });
    }

    // 4. Atualizar pedido no WooCommerce
    console.log('🔄 [Update Customer] Atualizando pedido no WooCommerce...');

    const result = await updateWooCommerceOrderCustomer(
      customerData.shopify_order_id.toString(),
      {
        first_name: customerData.customer_first_name || customerData.billing_address.first_name || 'Cliente',
        last_name: customerData.customer_last_name || customerData.billing_address.last_name || 'Shopify',
        email: customerData.customer_email || 'sem-email@shopify.com',
        phone: customerData.customer_phone || customerData.billing_address.phone || '',
        billing_address: {
          first_name: customerData.billing_address.first_name || customerData.customer_first_name || 'Cliente',
          last_name: customerData.billing_address.last_name || customerData.customer_last_name || 'Shopify',
          address1: customerData.billing_address.address1 || '',
          address2: customerData.billing_address.address2 || '',
          city: customerData.billing_address.city || '',
          state: customerData.billing_address.province || '',
          postcode: customerData.billing_address.zip || '',
          country: customerData.billing_address.country_code || 'AR',
          phone: customerData.billing_address.phone || customerData.customer_phone || ''
        },
        shipping_address: {
          first_name: customerData.shipping_address.first_name || customerData.customer_first_name || 'Cliente',
          last_name: customerData.shipping_address.last_name || customerData.customer_last_name || 'Shopify',
          address1: customerData.shipping_address.address1 || '',
          address2: customerData.shipping_address.address2 || '',
          city: customerData.shipping_address.city || '',
          state: customerData.shipping_address.province || '',
          postcode: customerData.shipping_address.zip || '',
          country: customerData.shipping_address.country_code || 'AR'
        }
      }
    );

    if (!result.success) {
      console.error('❌ [Update Customer] Erro ao atualizar:', result.error);
      return NextResponse.json({
        success: false,
        error: result.error
      }, { status: 500 });
    }

    console.log('✅ [Update Customer] Pedido atualizado com sucesso:', {
      woo_order_id: result.woo_order_id,
      updated_fields: result.updated_fields
    });

    return NextResponse.json({
      success: true,
      woo_order_id: result.woo_order_id,
      message: 'Customer data updated successfully'
    });

  } catch (error) {
    console.error('❌ [Update Customer] Erro:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
