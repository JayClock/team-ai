import { describe, expect, it } from 'vitest';
import { parseHalTemplates } from '../../lib/state/hal-state/parse-hal-templates.js';
import { Links } from '../../lib/links/links.js';
import { Entity } from '../../lib/index.js';
import type { HalFormsProperty, HalFormsTemplate } from 'hal-types';

type TestEntity = Entity<
  { id: string },
  { self: TestEntity },
  { create: TestEntity; update: TestEntity }
>;

describe('parseHalTemplates', () => {
  const mockLinks = new Links<TestEntity['links']>('https://example.com', [
    { rel: 'self', href: '/api/resources/1' },
  ]);

  it('should parse template name from object key', () => {
    const templates = {
      create: {
        method: 'POST',
        title: 'Create Resource',
        properties: [],
      },
      update: {
        method: 'PUT',
        title: 'Update Resource',
        properties: [],
      },
    };

    const forms = parseHalTemplates(mockLinks, templates);

    expect(forms).toHaveLength(2);
    expect(forms[0].name).toBe('create');
    expect(forms[1].name).toBe('update');
  });

  it('should parse title from template', () => {
    const templates = {
      create: {
        method: 'POST',
        title: 'Create New Resource',
        properties: [],
      },
    };

    const forms = parseHalTemplates(mockLinks, templates);

    expect(forms[0].title).toBe('Create New Resource');
  });

  it('should parse method from template', () => {
    const templates = {
      delete: {
        method: 'DELETE',
        properties: [],
      },
    };

    const forms = parseHalTemplates(mockLinks, templates);

    expect(forms[0].method).toBe('DELETE');
  });

  it('should use target if provided, otherwise use self link', () => {
    const templates = {
      customTarget: {
        method: 'POST',
        target: '/api/custom-endpoint',
        properties: [],
      },
      defaultTarget: {
        method: 'GET',
        properties: [],
      },
    };

    const forms = parseHalTemplates(mockLinks, templates);

    const customForm = forms.find((f) => f.name === 'customTarget');
    const defaultForm = forms.find((f) => f.name === 'defaultTarget');

    expect(customForm?.uri).toBe('/api/custom-endpoint');
    expect(defaultForm?.uri).toBe('/api/resources/1');
  });

  it('should default contentType to application/json', () => {
    const templates = {
      create: {
        method: 'POST',
        properties: [],
      },
    };

    const forms = parseHalTemplates(mockLinks, templates);

    expect(forms[0].contentType).toBe('application/json');
  });

  it('should use custom contentType if provided', () => {
    const templates = {
      create: {
        method: 'POST',
        contentType: 'application/x-www-form-urlencoded',
        properties: [],
      },
    };

    const forms = parseHalTemplates(mockLinks, templates);

    expect(forms[0].contentType).toBe('application/x-www-form-urlencoded');
  });

  it('should parse properties into fields', () => {
    const templates: Record<string, HalFormsTemplate> = {
      create: {
        method: 'POST',
        properties: [
          {
            name: 'title',
            type: 'text' as const,
            required: true,
            prompt: 'Title',
          },
          {
            name: 'description',
            type: 'textarea' as const,
            required: false,
            prompt: 'Description',
          },
        ] as HalFormsProperty[],
      },
    };

    const forms = parseHalTemplates(mockLinks, templates);

    expect(forms[0].fields).toHaveLength(2);
    expect(forms[0].fields[0].name).toBe('title');
    expect(forms[0].fields[0].type).toBe('text');
    expect(forms[0].fields[0].required).toBe(true);
    expect(forms[0].fields[1].name).toBe('description');
    expect(forms[0].fields[1].type).toBe('textarea');
  });

  it('should handle empty templates object', () => {
    const forms = parseHalTemplates(mockLinks, {});

    expect(forms).toHaveLength(0);
  });

  it('should handle undefined templates', () => {
    const forms = parseHalTemplates(mockLinks, undefined);

    expect(forms).toHaveLength(0);
  });
});
