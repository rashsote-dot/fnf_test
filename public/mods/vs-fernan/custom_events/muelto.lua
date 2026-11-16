luaDebugMode = true

function onEvent(name, value1, value2)
	if name == 'muelto' then
		doTweenY('gfGroupY', 'gfGroup', getProperty('gfGroup.y') - 80, 0.35, 'SineOut')
		runTimer('mueltito', 0.35)
	end
end

function onTimerCompleted(tag, loops, loopsLeft) -- penis
	if tag == 'mueltito' then
		doTweenY('gfGroupY2', 'gfGroup', getProperty('gfGroup.y') + 1200, 1.6, 'cubeInOut')
	end
end