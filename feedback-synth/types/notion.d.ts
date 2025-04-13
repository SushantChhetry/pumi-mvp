// types/notion.d.ts
import { PageObjectResponse, PartialPageObjectResponse } from "@notionhq/client/build/src/api-endpoints";

export interface NotionPage {
  id: string;
  properties: Record<string, NotionProperty>;
}

export interface NotionProperty {
  type: string;
  select?: { name: string };
  rich_text?: { plain_text: string };
  title?: { plain_text: string };
  // Add other property types as needed
}

// Type guard for full page responses
function isFullPage(page: PageObjectResponse | PartialPageObjectResponse): page is PageObjectResponse {
  return (page as PageObjectResponse).properties !== undefined;
}

// Transformer function
export function transformNotionPage(page: PageObjectResponse | PartialPageObjectResponse): NotionPage {
  if (!isFullPage(page)) {
    throw new Error('Received partial page response where full page was expected');
  }

  const transformedProperties: Record<string, NotionProperty> = {};
  
  Object.entries(page.properties).forEach(([key, property]) => {
    const transformedProp: NotionProperty = { type: property.type };
    
    switch (property.type) {
      case 'select':
        transformedProp.select = { 
          name: property.select?.name || 'Unnamed Select' 
        };
        break;
      case 'rich_text':
        transformedProp.rich_text = {
          plain_text: property.rich_text?.[0]?.plain_text || ''
        };
        break;
      case 'title':
        transformedProp.title = {
          plain_text: property.title?.[0]?.plain_text || ''
        };
        break;
      // Handle other property types
    }
    
    transformedProperties[key] = transformedProp;
  });

  return {
    id: page.id,
    properties: transformedProperties
  };
}