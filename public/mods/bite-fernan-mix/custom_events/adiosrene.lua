function onEvent(name, value1, value2)
	if name == 'adiosrene' then
		doTweenX('adrTweenX', 'gfGroup', -15, 0.2, 'ElasticInOut')
		doTweenColor('adrColor', 'gfGroup', 'FF0000', 0.2, 'QuartOut')
		runTimer('UUAH', 0.5)
	end
end

function onTimerCompleted(tag, loops, loopsLeft) -- penis
	if tag == 'UUAH' then
		doTweenAngle('adrAngleX2', 'gfGroup', -350, 0.5, 'SineOut')
		runTimer('pipi', 0.2)
	end
	
	if tag == 'pipi' then
		doTweenAngle('adrAngleX2', 'gfGroup', -3600, 0.8, 'Linear')
		runTimer('waaa', 0.8)
	end
	
	if tag == 'waaa' then
		setProperty('gfGroup.visible', false)
		doTweenColor('adrColor', 'gfGroup', 'FFFFFF', 0.001, 'Linear')
		--cancelTween('adrColor')
	end
end