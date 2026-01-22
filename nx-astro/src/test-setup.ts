jest.mock('nx/src/utils/workspace-context', () => {
  const actual = jest.requireActual('nx/src/utils/workspace-context');
  return {
    ...actual,
    globWithWorkspaceContextSync: jest.fn(() => []),
    globWithWorkspaceContext: jest.fn(async () => []),
  };
});

jest.mock('@nx/devkit', () => {
  const actual = jest.requireActual('@nx/devkit');
  return {
    ...actual,
    formatFiles: jest.fn().mockResolvedValue(undefined),
  };
});
